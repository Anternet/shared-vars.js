const crypto = require('crypto');
const secp256k1 = require('secp256k1');

const HASH_ALGORITHM = 'sha256';
const BUFFER_ENCODING = 'hex';
const PRIVATE_KEY_LENGTH = 32;
const PUBLIC_KEY_LENGTH = PRIVATE_KEY_LENGTH + 1;
const TIMESTAMP_LENGTH = 8;
const TIMESTAMP_BYTE_LENGTH = 6;
const SIGNATURE_LENGTH = 64;
const HASH_LENGTH = 32;
const BUFFER_LENGTH = PUBLIC_KEY_LENGTH + SIGNATURE_LENGTH + TIMESTAMP_LENGTH + HASH_LENGTH;


class Signature {

  constructor(timestamp, valueHash, publicKey, signature) {
    this.publicKey = publicKey;
    this.valueHash = valueHash;
    this.timestamp = timestamp;
    this.signature = signature;
  }


  /** consts **/

  static get ID_LENGTH() {
    return PUBLIC_KEY_LENGTH;
  }

  /** static methods **/

  static fromBuffer(buffer) {
    if (buffer.length !== BUFFER_LENGTH) throw new Error('Invalid buffer length');

    let end = PUBLIC_KEY_LENGTH;
    const publicKey = buffer.slice(0, end);

    let start = end; end = start + SIGNATURE_LENGTH;
    const signature = buffer.slice(start, end);

    start = end; end = start + TIMESTAMP_LENGTH;
    const timestamp = new Date(buffer.readUIntBE(start, TIMESTAMP_BYTE_LENGTH));

    start = end; end = start + HASH_LENGTH;
    const valueHash = buffer.slice(start, end);

    return new this(timestamp, valueHash, publicKey, signature);
  }

  static sign(privateKey, valueHash, timestamp = new Date()) {
    const hash = Signature.createHash()
    .update(this.valueHash)
    .update(timeToBuffer(timestamp.getTime()))
    .digest();

    const signObj = secp256k1.sign(hash, privateKey);
    const publicKey = Signature.generatePrivateKey(privateKey);

    return new this(timestamp, valueHash, publicKey, signObj.signature);
  }

  static createHash() {
    return crypto.createHash(HASH_ALGORITHM);
  }

  static generatePrivateKey(callback) {
    if (callback === undefined) {
      let privateKey;

      do {
        privateKey = crypto.randomBytes(PRIVATE_KEY_LENGTH);
      } while (!secp256k1.privateKeyVerify(privateKey));

      return privateKey;
    }

    crypto.randomBytes(PRIVATE_KEY_LENGTH, (err, privateKey) => {
      if (err || secp256k1.privateKeyVerify(privateKey)) return callback(err, privateKey);

      this.generatePrivateKey(callback);
    });
  }

  static getPublicKey(privateKey) {
    return secp256k1.publicKeyCreate(privateKey);
  }


  /** public methods **/

  toString() {
    return this.publicKey.toString(BUFFER_ENCODING);
  }

  toBuffer() {
    const arr = [this.publicKey, this.signature, timeToBuffer(this.timestamp.getTime()), this.valueHash];
    return Buffer.concat(arr, BUFFER_LENGTH);
  }

  equals(other) {
    if (this === other) return true;

    return other instanceof Signature && this.publicKey.equals(other.publicKey)
        && this.timestamp.getTime() === other.timestamp.getTime() && this.valueHash.equals(other.valueHash);
  }

  verify() {
    const hash = Signature.createHash()
    .update(this.valueHash)
    .update(timeToBuffer(this.timestamp.getTime()))
    .digest();

    return secp256k1.verify(hash, this.signature, this.publicKey);
  }

  betterThen(other) {
    return this.timestamp >= other.timestamp && this.publicKey.equals(other.publicKey);
  }
}

module.exports = Signature;


/** local helpers **/

function timeToBuffer(time) {
  const buf = Buffer.alloc(TIMESTAMP_LENGTH);
  buf.writeUIntBE(time, 0, TIMESTAMP_BYTE_LENGTH);
  return buf;
}
