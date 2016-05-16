

class DynamicBuffer {

  constructor(size = 0) {
    this.length = size;
    this.filled = 0;

    this._readyBuffers = [];
    this._futureBuffers = [];
  }

  get isComplete() {
    return this.filled === this.length;
  }

  add(buffer, pos) {
    const newLength = pos + buffer.length;
    if (newLength <= this.filled) return;
    if (newLength > this.length) this.length = newLength;

    if (this.filled < pos) return this._futureBuffers.push({ pos, buffer });

    if (this.filled < newLength) this.filled = newLength;
    this._readyBuffers.push({ pos, buffer });

    if (!this._futureBuffers.length) return;

    const futureBuffers = this._futureBuffers.sort(sortBuffers);
    this._futureBuffers = [];

    futureBuffers.forEach(item => this.add(item.buffer, item.pos));
  }

  join() {
    if (!this._readyBuffers.length) return Buffer.alloc(0);
    if (this._readyBuffers.length === 1) {
      return this._readyBuffers[0].buffer;
    }

    const buffers = this._readyBuffers.sort(sortBuffers);
    const buffer = Buffer.alloc(this.filled);

    buffers.forEach(item => item.buffer.copy(buffer, item.pos));
    this._readyBuffers = [{ buffer, pos: 0 }];

    return buffer;
  }

}

module.exports = DynamicBuffer;


/** local helpers **/

function sortBuffers(a, b) {
  return a.pos - b.pos;
}
