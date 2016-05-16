const ip = require('ip');

const ERROR_TIMEOUT = 300e3;
// const ERRORS_LIMIT = 5;

const IPV4_LENGTH = 4;
const IPV6_LENGTH = 16;


class Peer {

  constructor(rinfo) {
    if (typeof rinfo === 'object') {
      this.address = rinfo.address;
      this.port = rinfo.port;
      this.family = rinfo.family;
    } else {
      const i = rinfo.lastIndexOf(':');

      this.address = rinfo.substr(0, i);
      this.port = parseInt(rinfo.substr(i + 1), 10);
    }

    this._signatures = new Map();

    this.errors = 0;
    this.timeouts = 0;

    this.lastSeen = null;
    this.lastError = null;
  }

  /** static methods **/

  static fromBuffer(buffer) {
    return new this({
      address: ip.toString(buffer.slice(0, buffer.length - 2)),
      port: buffer.readUInt16BE(buffer.length - 2),
    });
  }

  static equals(a, b) {
    return (a.address === b.address && a.port === b.port);
  }

  static rinfoKey(rinfo) {
    return `${rinfo.address}:${rinfo.port}`;
  }


  /** general methods **/

  get key() {
    return `${this.address}:${this.port}`;
  }

  toBuffer() {
    const ipLength = ip.isV4Format(this.address) ? IPV4_LENGTH : IPV6_LENGTH;
    const buffer = Buffer.alloc(ipLength + 2);

    ip.toBuffer(this.address, buffer, 0);
    buffer.writeUInt16BE(this.port, ipLength);

    return buffer;
  }

  equals(other) {
    return (this.address === other.address && this.port === other.port);
  }


  /** database methods **/

  getSignature(signature) {
    const key = signature.toString();
    return this._signatures.get(key);
  }

  setSignature(signature) {
    const key = signature.toString();
    this._signatures.set(key, signature);

    return this;
  }

  hasSignature(signature) {
    const sig = this.getSignature(signature);
    return sig ? sig.equals(signature) : false;
  }


  /** statistics methods **/

  addRequest() {
    this.lastSeen = new Date();
    this.timeouts = 0;
  }

  addResponse() {
    this.lastSeen = new Date();
    this.timeouts = 0;
  }

  addError(isTimeout) {
    const oldError = this.lastError;
    this.lastError = new Date();

    if (this.lastError - oldError > ERROR_TIMEOUT) {
      this.errors = 1;
    } else {
      this.errors++;
    }

    if (isTimeout) {
      this.timeouts++;
    } else {
      this.timeouts = 0;
    }
  }

}

module.exports = Peer;
