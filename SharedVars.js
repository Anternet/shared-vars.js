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

function Shared(opts) {
  if (!(this instanceof Shared))
    return new Shared(opts);

  Shared.super_.call(this);
  if(!opts) opts = {};

  const self = this;
  this._socket = opts.socket || dgram.createSocket(opts);
  this._parser = new MsgPack();

  this._rids = {};
  this._nextRid = Math.random() * RID_MAX;
  this._requestTypesMap = {
    [MSG_TYPE_PING]: this._pingHandler
  };

  this._peers = [];
  this._peersMap = {};
  this._peersVarsMap = {};
  this._varsMap = {};

  initSocket(this, this._socket);
}
util.inherits(Shared, EventEmitter);
 module.exports = Shared;
const proto = Shared.prototype;



/** protocol methods **/

proto.connect =
proto.ping = function(address, port, callback) {
  const rinfo = parseRinfo(address, port);
  if(rinfo.port !== port) callback = port;

  const self = this;
  const rid = this._genRid(rinfo, function(err) {
    if(err) {
      self._removePeer(rinfo);
    } else {
      self._addPeer(rinfo);
    }

    if(callback) callback.call(this, arguments);
  });

  this.send([MSG_TYPE_PING, rid], rinfo);
};

proto.assign = function(value) {
  return new SharedVar(this, null, null, value);
};

proto.get = function(publicKey) {
  return new SharedVar(this, publicKey);
};

proto.lookup = function(publicKey, currentSig, callback) {
  const key = publicKey.toString(BUFFER_ENCODING);

  let peers = this._peersVarsMap[key];
  if(!peers) peers = this._peers;

  const self = this;
  let newPeers = [];
  let latest = currentSig || null;

  async.eachLimit(peers, PUBLIC_ASYNC_LIMIT, function (peer, callback) {
    const rid = self._genRid(peer, function (err, data) {
      if(err || !data.length) return callback();

      const sig = data[0];
      if(!(sig instanceof Signature) || !sig.publicKey.equals(publicKey) || !sig.verify()) return callback();

      if(!latest || sig.betterThen(latest)) {
        latest = sig;
      }

      newPeers.push(peer);
      callback();
    });

    self.send([MSG_TYPE_GET, rid, publicKey]);
  }, function() {
    self._peersVarsMap[key] = newPeers;

    if(!callback) return;
    callback(null, latest);
  });

  return this;

};

proto.publish = function(sharedVar, callback) {
  const key = sharedVar.publicKey.toString(BUFFER_ENCODING);
  this._varsMap[key] = sharedVar;

  if(!this._peersVarsMap[key]) return this;

  const self = this;
  const peers = this._peersVarsMap[key];
  let errors = 0;

  async.eachLimit(peers, PUBLIC_ASYNC_LIMIT, function (peer, callback) {
    const rid = self._genRid(peer, function (err) {
      if(err) errors++;
      callback();
    });

    self.send([MSG_TYPE_PUBLISH, rid, sharedVar.signature]);
  }, function () {
    if(!callback) return;

    callback(null, peers.length - errors);
  });

  return this;
};

proto.onPublish = function(publicKey, listener) {
  var event = publicKey.toString(BUFFER_ENCODING);
  this.on(event, listener);
};

proto.download = function(signature, callback) {

};


/** socket methods **/

proto.address = function () {
  return this._socket.address.apply(this._socket, arguments);
};

proto.send = function (data, address, port, callback) {
  const buf = this._parser.encode(data);
  const rinfo = parseRinfo(address, port);
  if(rinfo.port !== port) callback = port;

  this._socket.send(buf, 0, buf.length, rinfo.port, rinfo.address, callback);

  return this;
};

[
  'bind', 'close',
  'addMembership', 'dropMembership',
  'setBroadcast', 'setMulticastLoopback', 'setMulticastTTL',
  'ref', 'unref'
].forEach(function(method) {
  proto[method] = function () {
    this._socket[method].apply(this._socket, arguments);
    return this;
  };
});


/** parser methods **/


[
  'register', 'decode', 'encode'
].forEach(function(method) {
  proto[method] = function () {
    this._socket[method].apply(this._socket, arguments);
    return this;
  };
});


/** protected methods **/

proto._addPeer = function(rinfo) {
  const key = rinfo.address + ':' + rinfo.port;
  if(this._peersMap.hasOwnProperty(key)) return;

  const peer = {
    address: rinfo.address,
    port: rinfo.port
  };
  this._peersMap[key] = peer;
};

proto._removePeer = function(rinfo) {
  const key = rinfo.address + ':' + rinfo.port;
  if(!this._peersMap.hasOwnProperty(key)) return;

  //const peer = this._peersMap[key];
  delete this._peersMap[key];
};

proto._handleMessage = function(data, rinfo) {
  if(!Array.isArray(data) || data.length < 2) return;

  const type = data.shift(), rid = data.shift();
  if(typeof type !== 'number' || typeof rid !== 'number') return;

  if(type === MSG_TYPE_RESPONSE) {
    this._handleResponse(data, rid, rinfo);
  } else if(type > MSG_TYPE_RESPONSE) {
    this._handleRequest(data, type, rid, rinfo);
  } else if(type < MSG_TYPE_RESPONSE) {
    this._handleErrorResponse(data, type, rid, rinfo);
  }
};

proto._handleRequest = function(data, type, rid, rinfo) {
  if(!this._requestTypesMap[type]) {
    this.send([MSG_TYPE_ERROR_UNKNOWN, rid, 'Unknown request type'], rinfo);
    return;
  }

  const handler = this._requestTypesMap[type];
  handler.call(this, data, rid, rinfo);
};

proto._handleResponse = function(data, rid, rinfo) {
  const callback = this._getRidCallback(rid, rinfo);
  if(!callback) return;

  callback(null, data, rinfo);
};

proto._handleErrorResponse = function(data, code, rid, rinfo) {
  const callback = this._getRidCallback(rid, rinfo);
  if(!callback) return;

  const err = new Error(data.shift() || ('error code: ' + code));
  err.code = code;

  callback(err, data, rinfo);
};

proto._pingHandler = function(data, rid, rinfo) {
  this.send([MSG_TYPE_RESPONSE, rid], rinfo);
};

proto._close = function() {
  this._socket = null;
};

proto._genRid = function(rinfo, callback) {
  const rid = this._getNextRid();
  const self = this;

  let obj = this._rids[rid] = {
    rinfo,
    callback,
    timeout: setTimeout(function() {
      delete self._rids[rid];
      obj.callback(new Error('TIMEOUT'));
    }, RID_TIMEOUT)
  };

  return rid;
};

proto._getRidCallback = function(rid, rinfo) {
  if(!this._rids[rid]) return;

  const obj = this._rids[rid];
  if(!rinfoEqual(obj.rinfo, rinfo)) return;

  const self = this;
  return function(err) {
    if(obj.callback.apply(self, arguments) === true && !err) return;

    clearTimeout(obj.timeout);
    delete self._rids[rid];
  };
};

proto._getNextRid = function() {
  const start = this._nextRid;
  const now = Date.now();

  let rid = this._nextRid++;
  if(this._nextRid > RID_MAX) this._nextRid = 0;

  while(this._rids[rid] && this._rids[rid].ttl > now) {
    rid = this._nextRid++;
    if(this._nextRid > RID_MAX) this._nextRid = 0;

    if(rid === start) throw new Error('No new request ids left');
  }

  return rid;
};


/** local helpers **/

function initSocket(self, socket) {
  socket.on('close', function () {
    self._close();
    self.emit('close');
  });

  socket.on('error', function (err) {
    if(!self.emit('error', err)) throw err;

    try {
      self._close();
    } catch(err) {
      console.warn(err.stack);
    }
  });

  socket.on('listening', function () {
    self.emit('listening');
  });

  socket.on('message', function (buf, rinfo) {
    try {
      var data = self.decode(buf);
    } catch(err) {
      return;
    }

    self.emit('message', data, rinfo);
    self._handleMessage(data, rinfo);
  });
}

function parseRinfo(address, port) {
  if(typeof address !== 'string') return address;
  if(typeof port === 'number') return {address, port};

  let i = address.lastIndexOf(':');
  return {
    address: parseInt(address.substr(i + 1), 10),
    port: address.substr(0, i)
  };
}

function rinfoEqual(a, b) {
  return (a.address === b.address && a.port === b.port);
}
