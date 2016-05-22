const EventEmitter = require('events');
const dgram = require('dgram');
const async = require('async');
const SharedVar = require('./shared-var');
const Signature = require('./signature');
const Peer = require('./peer');
const DynamicBuffer = require('./dynamic-buffer');
const parser = require('./parser');

const MSG_TYPE_RESPONSE = 0x00;
const MSG_TYPE_PING = 0x01;
const MSG_TYPE_GET = 0x02;
const MSG_TYPE_PUBLISH = 0x03;
const MSG_TYPE_DOWNLOAD = 0x04;
const MSG_TYPE_ERROR_PARAM = -2;
const MSG_TYPE_ERROR_NOT_FOUND = -3;
const MSG_TYPE_ERROR_UNKNOWN = -1;

const RID_MAX = 0xffff;
const RID_TIMEOUT = 10e3;

const BUFFER_ENCODING = 'hex';
const PUBLIC_ASYNC_LIMIT = 100;
const PEERS_DOWNLOAD_LIMIT = 2;
const DOWNLOAD_BUFFER_MAX_LENGTH = 500;

class SharedVars extends EventEmitter {

  constructor(opts = {}) {
    super();

    this._rids = {};
    this._nextRid = Math.floor(Math.random() * RID_MAX);
    this._requestTypesMap = {
      [MSG_TYPE_PING]: this._pingHandler,
      [MSG_TYPE_GET]: this._getHandler,
      [MSG_TYPE_PUBLISH]: this._publishHandler,
      [MSG_TYPE_DOWNLOAD]: this._downloadHandler,
    };

    this._peers = new Map();
    this._vars = new Map();

    this._initSocket(opts);
    this._parser = opts.parser || SharedVars.parser;
  }


  /** get mehods **/

  get socket() {
    return this._socket;
  }

  get type() {
    return this._socket.type;
  }


  /** maintenance methods **/

  _initSocket(opts) {
    let socket;
    if (opts.socket instanceof dgram.Socket) {
      socket = opts.socket;
    } else {
      socket = dgram.createSocket(Object.assign({
        type: 'udp4',
      }, opts));
    }

    this._socket = socket;

    this._socket.on('close', () => {
      this._close();
      this.emit('close');
    });

    socket.on('error', (err) => {
      if (!this.emit('error', err)) throw err;

      try {
        this._close();
      } catch (ex) {
        // ignore closing errors
      }
    });

    socket.on('listening', () => {
      this.emit('listening');
    });

    socket.on('message', (buf, rinfo) => {
      let data;

      try {
        data = this.decode(buf);
      } catch (err) {
        return;
      }

      this.emit('message', data, rinfo);
      this._handleMessage(data, rinfo);
    });
  }

  _close() {
    this._socket = null;
  }


  /** logic methods **/

  ping(rinfo, callback) {
    const peer = this.getPeer(rinfo);

    const rid = this._genRid(peer, (err, data) => {
      if (callback) callback.call(this, err, data, peer);
    });

    this.send([MSG_TYPE_PING, rid], peer);
  }

  assign(value, callback) {
    const privateKey = Signature.generatePrivateKey();
    const publicKey = Signature.getPublicKey(privateKey);

    const sharedVar = new SharedVar(this, publicKey, privateKey);

    const key = publicKey.toString(BUFFER_ENCODING);
    this._vars.set(key, sharedVar);

    return sharedVar.set(value, callback);
  }

  get(id) {
    const key = id.toString(BUFFER_ENCODING);

    let sharedVar = this._vars.get(key);
    if (!sharedVar) {
      sharedVar = new SharedVar(this, id);
      this._vars.set(key, sharedVar);

      process.nextTick(() => sharedVar.sync());
    }

    return sharedVar;
  }

  lookup(id, signature, peers, callback) {
    let latest = signature || null;

    const foundPeers = [];

    async.eachLimit(peers || this._peers.values(), PUBLIC_ASYNC_LIMIT, (peer, callback) => {
      const rid = this._genRid(peer, (err, data) => {
        if (err || !data.length) return callback();

        const sig = data.shift();
        if (!(sig instanceof Signature)) return callback();

        if (!id.equals(sig.publicKey) || !sig.verify()) {
          peer.addError();
          return callback();
        }

        peer.setSignature(sig);
        foundPeers.push(peer);

        if (!latest || sig.betterThen(latest)) latest = sig;
        callback();
      });

      this.send([MSG_TYPE_GET, rid, id], peer);
    }, (err) => {
      if (err) return callback(err);

      callback(null, latest, foundPeers);
    });

    return this;
  }

  publish(signature, peers, callback) {
    let success = 0;

    async.eachLimit(peers, PUBLIC_ASYNC_LIMIT, (peer, callback) => {
      const rid = this._genRid(peer, (err, data) => {
        if (err) return callback();


        const sig = data.shift();
        if (sig instanceof Signature) {
          if (!sig.similarTo(signature) || !sig.betterThen(signature) || !sig.verify()) {
            peer.addError();
            return callback();
          }

          peer.setSignature(sig);
        }

        success++;
        callback();
      });

      this.send([MSG_TYPE_PUBLISH, rid, signature]);
    }, (err) => {
      if (callback) callback(err, success);
    });

    return this;
  }

  download(signature, peers, callback) {
    let valueBuffer;

    async.detectLimit(peers, PEERS_DOWNLOAD_LIMIT, (peer, callback) => {
      const dynamicBuffer = new DynamicBuffer();

      const rid = this._genRid(peer, (err, data) => {
        if (err) return callback();

        const pos = data.shift();
        const buffer = data.shift();

        if (typeof pos !== 'number' || pos < 0 || !(buffer instanceof Buffer)) {
          peer.addError();
          return callback();
        }

        dynamicBuffer.add(buffer, pos);
        if (!dynamicBuffer.isComplete) return true;

        const buf = dynamicBuffer.join();
        const hash = Signature.createHash().update(buf).digest();

        if (!hash.equals(signature.valueHash)) return true;

        valueBuffer = buf;
        callback(null, true);
      });

      this.send([MSG_TYPE_DOWNLOAD, rid, signature], peer);
    }, (err) => {
      if (err) return callback(err);

      let value;
      try {
        value = this.decode(valueBuffer);
      } catch (err) {
        return callback(err);
      }

      callback(null, value);
    });

    return this;
  }


  /** socket methods **/

  address() {
    return this._socket.address();
  }

  send(data, rinfo, callback) {
    const buf = this._parser.encode(data);
    const peer = this.getPeer(rinfo);

    this._socket.send(buf, 0, buf.length, peer.port, peer.address, callback);
    return this;
  }

  bind(...args) {
    this._socket.bind.apply(this._socket, args);
  }

  close() {
    this._socket.close();
  }


  /** parser methods **/

  decode(...args) {
    return this._parser.decode.apply(this._parser, args);
  }

  encode(...args) {
    return this._parser.encode.apply(this._parser, args);
  }


  /** peers methods **/

  getPeer(rinfo) {
    const peerKey = Peer.rinfoKey(rinfo);
    let peer = this._peers.get(peerKey);

    if (!peer) {
      peer = new Peer(rinfo);
      this._peers.set(peerKey, peer);
    }

    return peer;
  }


  /** messages methods **/

  _handleMessage(data, rinfo) {
    if (!Array.isArray(data) || data.length < 2) return;

    const type = data.shift();
    const rid = data.shift();
    if (typeof type !== 'number' || typeof rid !== 'number') return;

    const peer = this.getPeer(rinfo);

    if (type === MSG_TYPE_RESPONSE) {
      this._handleResponse(data, rid, peer);
    } else if (type > MSG_TYPE_RESPONSE) {
      this._handleRequest(data, type, rid, peer);
    } else if (type < MSG_TYPE_RESPONSE) {
      this._handleErrorResponse(data, type, rid, peer);
    }
  }

  _handleResponse(data, rid, peer) {
    const callback = this._getRidCallback(rid, peer);
    if (!callback) {
      peer.addError();
      return;
    }

    peer.addResponse();
    callback(null, data, peer);
  }

  _handleErrorResponse(data, code, rid, peer) {
    peer.addError();

    const callback = this._getRidCallback(rid, peer);
    if (!callback) return;

    const err = new Error(data.shift() || (`error code: ${code}`));
    err.code = code;

    callback(err, data, peer);
  }

  _handleRequest(data, type, rid, peer) {
    if (!this._requestTypesMap[type]) {
      peer.addError();
      this.send([MSG_TYPE_ERROR_UNKNOWN, rid, 'Unknown request type'], peer);
      return;
    }

    peer.addRequest();
    const handler = this._requestTypesMap[type];

    handler.call(this, data, peer, (err, ...args) => {
      if (err) peer.addError();

      args.unshift(err || MSG_TYPE_RESPONSE, rid);
      this.send(args, peer);
    });
  }

  _pingHandler(data, peer, callback) {
    this.emit('ping', data, peer);

    callback(null);
  }

  _getHandler(data, peer, callback) {
    const id = data.shift();

    if (!(id instanceof Buffer) || id.length !== Signature.ID_LENGTH) {
      return callback(MSG_TYPE_ERROR_PARAM, 'Invalid `id` param');
    }

    const key = id.toString(BUFFER_ENCODING);
    const sharedVar = this._vars.get(key);

    if (!sharedVar || !sharedVar.signature) return callback(null);

    callback(null, sharedVar.signature);
  }

  _publishHandler(data, peer, callback) {
    const signature = data.shift();

    if (!(signature instanceof Signature) || !signature.verify()) {
      return callback(MSG_TYPE_ERROR_PARAM, 'Invalid `signature` param');
    }

    peer.setSignature(signature);

    const key = signature.publicKey.toString(BUFFER_ENCODING);
    const sharedVar = this._vars.get(key);

    if (!sharedVar || sharedVar.updateSignature(signature, peer)) return callback(null);

    // send our newer signature back
    callback(null, sharedVar.signature);
  }

  _downloadHandler(data, peer, callback) {
    const signature = data.shift();

    if (!(signature instanceof Signature) || !signature.verify()) {
      return callback(MSG_TYPE_ERROR_PARAM, 'Invalid `signature` param');
    }

    const key = signature.publicKey.toString(BUFFER_ENCODING);
    const sharedVar = this._vars.get(key);

    if (!sharedVar || !sharedVar.signature || !sharedVar.signature.equals(signature)) {
      return callback(MSG_TYPE_ERROR_NOT_FOUND, 'The given signature not found');
    }

    const buffer = this.encode(sharedVar.value);
    let end = 0;

    do {
      const pos = end;
      end = Math.min(buffer.length, end + DOWNLOAD_BUFFER_MAX_LENGTH);

      callback(null, pos, buffer.slice(pos, end));
    } while (end < buffer.length);
  }


  /** rid handlers **/

  _genRid(peer, callback) {
    const rid = this._getNextRid();

    const obj = this._rids[rid] = {
      peer,
      callback,
      timeout: setTimeout(() => {
        delete this._rids[rid];
        peer.addError(true);

        obj.callback(new Error('TIMEOUT'));
      }, RID_TIMEOUT),
    };

    return rid;
  }

  _getRidCallback(rid, peer) {
    if (!this._rids[rid]) return;

    const obj = this._rids[rid];
    if (!peer.equals(obj.peer)) return;

    return (err, data) => {
      if (obj.callback.call(this, err, data, peer) === true && !err) return;

      clearTimeout(obj.timeout);
      delete this._rids[rid];
    };
  }

  _getNextRid() {
    const start = this._nextRid;
    const now = Date.now();

    let rid = this._nextRid++;
    if (this._nextRid > RID_MAX) this._nextRid = 0;

    while (this._rids[rid] && this._rids[rid].ttl > now) {
      rid = this._nextRid++;
      if (this._nextRid > RID_MAX) this._nextRid = 0;

      if (rid === start) throw new Error('No new request ids left');
    }

    return rid;
  }
}

SharedVars.parser = parser();
module.exports = SharedVars;
