const EventEmitter = require('events');
const Signature = require('./signature');

class SharedVar extends EventEmitter {

  constructor(shared, id, secret = null) {
    super();

    if (!(id instanceof Buffer)) throw new Error('Invalid SharedVar `id` type');
    if (id.length !== Signature.ID_LENGTH) throw new Error('Invalid SharedVar `id` length');

    this.value = undefined;
    this.signature = null;

    this.id = id;
    this.secret = secret;

    this._shared = shared;
    this._peers = new Map();
  }

  get isWritable() {
    return (this.secret != null);
  }

  sync(callback) {
    this._shared.lookup(this.id, this.signature, this.peersCount ? this.getPeers() : null, (err, signature, foundPeers) => {
      if (err) {
        if (callback) callback(err);
        return;
      }

      for (const peer of foundPeers) {
        this.addPeer(peer);
      }

      if (signature && (!this.signature || signature.betterThen(this.signature))) this.pushUpdate(signature);
      if (callback) callback(null, signature);
    });

    return this;
  }

  set(value, callback) {
    if (!this.secret) throw new Error('This reference is readonly');

    const valueBuf = this._shared.encode(value);
    const valueHash = Signature.createHash.update(valueBuf).digest();

    this.signature = Signature.sign(this.secret, valueHash);
    this.value = value;

    this._shared.publish(this.signature, this.getPeers(), callback);
    return this;
  }

  updateSignature(signature, peer) {
    this.addPeer(peer);
    return this.pushUpdate(signature);
  }

  pushUpdate(signature) {
    if (this.signature && this.signature.betterThen(signature)) return false;

    this.emit('download', signature);

    const peers = this.getPeers();

    const preferredPeers = [];
    for (const peer of peers) {
      if (peer.hasSignature(signature)) preferredPeers.push(peer);
    }

    if (!preferredPeers.length) {
      this.emit('downloadError', new Error('No peers found'));
      return this;
    }

    this._shared.download(signature, preferredPeers, (err, value) => {
      if (err) {
        this.emit('downloadError', err);
        return;
      }

      // In case other call update our signature already
      if (!signature.betterThen(this.signature)) return;

      this.value = value;
      this.signature = signature;

      this.emit('update');

      const outdatedPeers = [];
      for (const peer of this.getPeers()) {
        const sig = peer.getSignature(signature);
        if (signature.betterThen(sig)) outdatedPeers.push(peer);
      }

      if (outdatedPeers.length) this._shared.publish(signature, outdatedPeers);
    });

    return true;
  }

  /** peers methods **/

  get peersCount() {
    return this._peers.size;
  }

  getPeers() {
    return this._peers.values();
  }

  addPeer(peer) {
    this._peers.set(peer.key, peer);
    return this;
  }

  // removePeer(peer) {
  //   this._peers.delete(peer.key);
  //   return this;
  // }
}

module.exports = SharedVar;
