const EventEmitter = require('events');
const dgram = require('dgram');
const async = require('async');
const MsgPack = require('msgpack5');
const SharedVar = require('./shared-var');
const Signature = require('./signature');
const Peer = require('./peer');

const MSG_TYPE_RESPONSE = 0x00;
const MSG_TYPE_PING = 0x01;
const MSG_TYPE_GET = 0x02;
const MSG_TYPE_PUBLISH = 0x03;
const MSG_TYPE_ERROR_UNKNOWN = -1;

const RID_MAX = 0xffff;
const RID_TIMEOUT = 10e3;

const BUFFER_ENCODING = 'hex';
const PUBLIC_ASYNC_LIMIT = 100;

// allowed values: 0..127
const PARSER_REG_PEER = 101;
const PARSER_REG_SIGNATURE = 102;

class SharedVars extends EventEmitter {

  constructor(opts = {}) {
    super();

    this._rids = {};
    this._nextRid = Math.random() * RID_MAX;
    this._requestTypesMap = {
      [MSG_TYPE_PING]: this._pingHandler,
    };

    this._peers = new Map();
    this._vars = new Map();

    this._initSocket(opts.socket || dgram.createSocket(opts));
    this._initParser();
  }


  /** maintenance methods **/

  _initSocket(socket) {
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
        data = self.decode(buf);
      } catch (err) {
        return;
      }

      this.emit('message', data, rinfo);
      this._handleMessage(data, rinfo);
    });
  }

  _initParser() {
    this._parser = new MsgPack();
    this._parser.register(PARSER_REG_PEER, Peer, peer => peer.toBuffer(), buf => Peer.fromBuffer(buf));
    this._parser.register(PARSER_REG_SIGNATURE, Signature, sig => sig.toBuffer(), buf => Signature.fromBuffer(buf));
  }

  _close() {
    this.socket = null;
  }


  /** logic methods **/

  ping(rinfo, callback) {
    const peer = this.getPeer(rinfo);

    const rid = this._genRid(peer, (err, data) => {
      if (callback) callback.call(this, err, data, peer);
    });

    this.send([MSG_TYPE_PING, rid], peer);
  }

  assign(value) {
    return new SharedVar(this, null, null, value);
  }

  get(id) {
    const key = id.toString(BUFFER_ENCODING);

    let sharedVar = this._vars.get(key);
    if(sharedVar) {
      sharedVar = new SharedVar(this, id);
      this._vars.set(key, sharedVar);
    }

    return sharedVar;
  }

  lookup(id, signature, peers, callback) {
    let latest = signature || null;
    const newPeers = [];

    async.eachLimit(peers || this._peers.values(), PUBLIC_ASYNC_LIMIT, (peer, callback) => {
      const rid = this._genRid(peer, (err, data) => {
        if (err || !data.length) return callback();

        const sig = data.shift();
        if (!(sig instanceof Signature)) return callback();

        if (!id.equals(sig.publicKey) || !sig.verify()) {
          peer.addError();
          return callback();
        }

        peer.updateSignature(sig);

        if (!latest || sig.betterThen(latest)) {
          latest = sig;
        }

        if (!peers) newPeers.push(peer);
        callback();
      });

      this.send([MSG_TYPE_GET, rid, id], peer);
    }, (err) => {
      if (err) return callback(err);

      callback(null, latest, newPeers);
    });

    return this;
  }

  publish(signature, peers, callback) {
    let success = 0;

    async.eachLimit(peers, PUBLIC_ASYNC_LIMIT, (peer, callback) => {
      const rid = this._genRid(peer, (err) => {
        if (!err) success++;
        callback();
      });

      this.send([MSG_TYPE_PUBLISH, rid, signature]);
    }, () => {
      if (callback) callback(null, success);
    });

    return this;
  }

  onPublish(publicKey, listener) {
    const event = publicKey.toString(BUFFER_ENCODING);
    this.on(event, listener);
  }

  // download(signature, callback) {}


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

  register(...args) {
    this._parser.register.apply(this._parser, args);
  }

  decode(...args) {
    this._parser.decode.apply(this._parser, args);
  }

  encode(...args) {
    this._parser.encode.apply(this._parser, args);
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

    handler.call(this, data, rid, peer, (err, res) => {
      if (err) peer.addError();
      if (res) this.send(res, peer.address, peer.port);
    });
  }

  _pingHandler(data, rid, peer, callback) {
    callback(null, [MSG_TYPE_RESPONSE, rid]);
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

module.exports = SharedVars;
