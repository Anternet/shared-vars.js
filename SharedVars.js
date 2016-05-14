const util = require('util');
const EventEmitter = require('events');
const dgram = require('dgram');
const async = require('async');
const MsgPack = require('msgpack5');
const SharedVar = require('./SharedVar');
const Signature = require('./Signature');

const MSG_TYPE_RESPONSE = 0x00;
const MSG_TYPE_PING = 0x01;
const MSG_TYPE_GET = 0x02;
const MSG_TYPE_PUBLISH = 0x03;
const MSG_TYPE_ERROR_UNKNOWN = -1;

const RID_MAX = 0xffff;
const RID_TIMEOUT = 10e3;

const BUFFER_ENCODING = 'hex';
const PUBLIC_ASYNC_LIMIT = 100;

function Shared(opts = {}) {
  if (!(this instanceof Shared)) return new Shared(opts);

  Shared.super_.call(this);

  this._socket = opts.socket || dgram.createSocket(opts);
  this._parser = new MsgPack();

  this._rids = {};
  this._nextRid = Math.random() * RID_MAX;
  this._requestTypesMap = {
    [MSG_TYPE_PING]: this._pingHandler,
  };

  this._peers = [];
  this._peersMap = {};
  this._peersVarsMap = {};
  this._varsMap = {};

  initSocket.call(this, this._socket);
}
util.inherits(Shared, EventEmitter);
module.exports = Shared;
const proto = Shared.prototype;


/** protocol methods **/

proto.connect =
proto.ping = (address, port, callback = port) => {
  const rinfo = parseRinfo(address, port);

  const rid = this._genRid(rinfo, (err) => {
    if (err) {
      this._removePeer(rinfo);
    } else {
      this._addPeer(rinfo);
    }

    if (callback) callback.call(this, arguments);
  });

  this.send([MSG_TYPE_PING, rid], rinfo);
};

proto.assign = (value) => {
  return new SharedVar(this, null, null, value);
};

proto.get = (publicKey) => {
  return new SharedVar(this, publicKey);
};

proto.lookup = (publicKey, currentSig, callback) => {
  const key = publicKey.toString(BUFFER_ENCODING);

  let peers = this._peersVarsMap[key];
  if (!peers) peers = this._peers;

  const newPeers = [];
  let latest = currentSig || null;

  async.eachLimit(peers, PUBLIC_ASYNC_LIMIT, (peer, callback) => {
    const rid = this._genRid(peer, (err, data) => {
      if (err || !data.length) return callback();

      const sig = data[0];
      if (!(sig instanceof Signature) || !sig.publicKey.equals(publicKey) || !sig.verify()) return callback();

      if (!latest || sig.betterThen(latest)) {
        latest = sig;
      }

      newPeers.push(peer);
      callback();
    });

    this.send([MSG_TYPE_GET, rid, publicKey]);
  }, () => {
    this._peersVarsMap[key] = newPeers;

    if (!callback) return;
    callback(null, latest);
  });

  return this;
};

proto.publish = (sharedVar, callback) => {
  const key = sharedVar.publicKey.toString(BUFFER_ENCODING);
  this._varsMap[key] = sharedVar;

  if (!this._peersVarsMap[key]) return this;

  const peers = this._peersVarsMap[key];
  let errors = 0;

  async.eachLimit(peers, PUBLIC_ASYNC_LIMIT, (peer, callback) => {
    const rid = this._genRid(peer, (err) => {
      if (err) errors++;
      callback();
    });

    this.send([MSG_TYPE_PUBLISH, rid, sharedVar.signature]);
  }, () => {
    if (!callback) return;

    callback(null, peers.length - errors);
  });

  return this;
};

proto.onPublish = (publicKey, listener) => {
  const event = publicKey.toString(BUFFER_ENCODING);
  this.on(event, listener);
};

// proto.download = (signature, callback) => {
//
// };


/** socket methods **/

proto.address = () => {
  return this._socket.address.apply(this._socket, arguments);
};

proto.send = (data, address, port, callback = port) => {
  const buf = this._parser.encode(data);
  const rinfo = parseRinfo(address, port);

  this._socket.send(buf, 0, buf.length, rinfo.port, rinfo.address, callback);
  return this;
};

[
  'bind', 'close',
  'addMembership', 'dropMembership',
  'setBroadcast', 'setMulticastLoopback', 'setMulticastTTL',
  'ref', 'unref',
].forEach(method => {
  proto[method] = () => {
    this._socket[method].apply(this._socket, arguments);
    return this;
  };
});


/** parser methods **/


[
  'register', 'decode', 'encode',
].forEach(method => {
  proto[method] = () => {
    this._socket[method].apply(this._socket, arguments);
    return this;
  };
});


/** protected methods **/

proto._addPeer = (rinfo) => {
  const key = `${rinfo.address}:${rinfo.port}`;
  if (this._peersMap.hasOwnProperty(key)) return;

  const peer = {
    address: rinfo.address,
    port: rinfo.port,
  };
  this._peersMap[key] = peer;
};

proto._removePeer = (rinfo) => {
  const key = `${rinfo.address}:${rinfo.port}`;
  if (!this._peersMap.hasOwnProperty(key)) return;

  // const peer = this._peersMap[key];
  delete this._peersMap[key];
};

proto._handleMessage = (data, rinfo) => {
  if (!Array.isArray(data) || data.length < 2) return;

  const type = data.shift();
  const rid = data.shift();
  if (typeof type !== 'number' || typeof rid !== 'number') return;

  if (type === MSG_TYPE_RESPONSE) {
    this._handleResponse(data, rid, rinfo);
  } else if (type > MSG_TYPE_RESPONSE) {
    this._handleRequest(data, type, rid, rinfo);
  } else if (type < MSG_TYPE_RESPONSE) {
    this._handleErrorResponse(data, type, rid, rinfo);
  }
};

proto._handleRequest = (data, type, rid, rinfo) => {
  if (!this._requestTypesMap[type]) {
    this.send([MSG_TYPE_ERROR_UNKNOWN, rid, 'Unknown request type'], rinfo);
    return;
  }

  const handler = this._requestTypesMap[type];
  handler.call(this, data, rid, rinfo);
};

proto._handleResponse = (data, rid, rinfo) => {
  const callback = this._getRidCallback(rid, rinfo);
  if (!callback) return;

  callback(null, data, rinfo);
};

proto._handleErrorResponse = (data, code, rid, rinfo) => {
  const callback = this._getRidCallback(rid, rinfo);
  if (!callback) return;

  const err = new Error(data.shift() || (`error code: ${code}`));
  err.code = code;

  callback(err, data, rinfo);
};

proto._pingHandler = (data, rid, rinfo) => {
  this.send([MSG_TYPE_RESPONSE, rid], rinfo);
};

proto._close = () => {
  this._socket = null;
};

proto._genRid = (rinfo, callback) => {
  const rid = this._getNextRid();

  const obj = this._rids[rid] = {
    rinfo,
    callback,
    timeout: setTimeout(() => {
      delete this._rids[rid];
      obj.callback(new Error('TIMEOUT'));
    }, RID_TIMEOUT),
  };

  return rid;
};

proto._getRidCallback = (rid, rinfo) => {
  if (!this._rids[rid]) return;

  const obj = this._rids[rid];
  if (!rinfoEqual(obj.rinfo, rinfo)) return;

  return (err) => {
    if (obj.callback.apply(self, arguments) === true && !err) return;

    clearTimeout(obj.timeout);
    delete this._rids[rid];
  };
};

proto._getNextRid = () => {
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
};


/** local helpers **/

function initSocket(socket) {
  socket.on('close', () => {
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

function parseRinfo(address, port) {
  if (typeof address !== 'string') return address;
  if (typeof port === 'number') return { address, port };

  const i = address.lastIndexOf(':');
  return {
    address: parseInt(address.substr(i + 1), 10),
    port: address.substr(0, i),
  };
}

function rinfoEqual(a, b) {
  return (a.address === b.address && a.port === b.port);
}
