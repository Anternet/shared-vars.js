const assert = require('assert');
const Peer = require('../lib/peer');
const { describe, it } = global;

describe('Peer', () => {
  describe('.constructor', () => {
    it('should create from IPv4 rinfo', () => {
      const rinfo = {
        address: '83.54.192.20',
        port: 15921,
        family: 'IPv4',
      };

      const peer = new Peer(rinfo);
      assert(peer instanceof Peer);

      assert.equal(peer.address, rinfo.address);
      assert.equal(peer.port, rinfo.port);
      assert.equal(peer.family, rinfo.family);
    });

    it('should create from IPv4 string', () => {
      const address = '83.54.192.20';
      const port = 15921;
      const key = `${address}:${port}`;

      const peer = new Peer(key);
      assert(peer instanceof Peer);

      assert.equal(peer.key, key);

      assert.equal(peer.address, address);
      assert.equal(peer.port, port);
      assert.equal(peer.family, undefined);
    });
  });

  describe('.fromBuffer', () => {
    const ipArr = [83, 54, 192, 20];
    const port = 15921;

    const buffer = Buffer.from(ipArr.concat([0, 0]));
    buffer.writeUInt16BE(port, 4);

    it('should create from IPv4 buffer', () => {
      const peer = Peer.fromBuffer(buffer);

      assert(peer instanceof Peer);
      assert.equal(peer.port, port);
      assert.equal(peer.address, ipArr.join('.'));
      assert.equal(peer.family, undefined);

      assert(buffer.equals(peer.toBuffer()));
    });
  });
});
