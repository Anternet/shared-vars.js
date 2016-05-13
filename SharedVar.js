const EventEmitter = require('events');
const util = require('util');
const Signature = require('./Signature');

function SharedVar(shared, publicKey, privateKey = null) {
  EventEmitter.call(this);

  this._shared = shared;
  this.value = undefined;
  this.signature = null;

  this.publicKey = publicKey;
  this.privateKey = privateKey;

  const self = this;
  this._shared.onPublish(publicKey, function(signature) {
    if(self.signature && self.signature.betterThen(signature)) return;

    self.emit('download', signature);
    self._shared.download(signature, function(err, value) {
      if(err) return;

      self.value = value;
      self.signature = signature;

      self.emit('update');
    });
  });
}
util.inherits(SharedVar, EventEmitter);
const proto = SharedVar.prototype;


proto.sync = function(callback) {
  this._shared.lookup(this.publicKey, this.signature);
  if(callback) this.once('update', callback);

  return this;
};

proto.set = function(value) {
  if(!this.privateKey) throw new Error('This reference is readonly');

  this.value = value;

  const valueBuf = this._shared.encode(value);
  const valueHash = Signature.createHash.update(valueBuf).digest();
  this.signature = Signature.sign(this.privateKey, valueHash);

  this._shared.publish(this.signature, this);
  return this;
};

//proto.compareTo = function(timestamp) {
//  if(!this.timestamp) return -1;
//
//  return this.timestamp.getTime() - timestamp;
//};

//proto.forward = function(address, port) {
//  return this;
//};
