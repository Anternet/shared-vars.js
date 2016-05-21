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

    it('should create from IPv6 rinfo', () => {
      const rinfo = {
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        port: 3940,
        family: 'IPv6',
      };
      const nAddress = '2001:db8:85a3::8a2e:370:7334';

      const peer = new Peer(rinfo);
      assert(peer instanceof Peer);

      assert.equal(peer.address, nAddress);
      assert.equal(peer.port, rinfo.port);
      assert.equal(peer.family, rinfo.family);
    });

    it('should create from IPv6 string', () => {
      const address = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const nAddress = '2001:db8:85a3::8a2e:370:7334';
      const port = 3940;

      const peer = new Peer(`${address}:${port}`);
      assert(peer instanceof Peer);

      assert.equal(peer.key, `${nAddress}:${port}`);

      assert.equal(peer.address, nAddress);
      assert.equal(peer.port, port);
      assert.equal(peer.family, undefined);
    });
  });

  describe('.fromBuffer()', () => {
    it('should create from IPv4 buffer', () => {
      const ipArr = [83, 54, 192, 20];
      const port = 15921;

      const buffer = Buffer.from(ipArr.concat([0, 0]));
      buffer.writeUInt16BE(port, 4);

      const peer = Peer.fromBuffer(buffer);

      assert(peer instanceof Peer);
      assert.equal(peer.port, port);
      assert.equal(peer.address, ipArr.join('.'));
      assert.equal(peer.family, undefined);

      assert(buffer.equals(peer.toBuffer()));
    });

    it('should create from IPv6 buffer', () => {
      const ipArr = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'.split(':');
      const shortAddress = '2001:db8:85a3::8a2e:370:7334';
      const port = 28650;
      const buffer = Buffer.from(ipArr.join('') + port.toString(16), 'hex');

      const peer = Peer.fromBuffer(buffer);

      assert(peer instanceof Peer);
      assert.equal(peer.port, port);
      assert.equal(peer.address, shortAddress);
      assert.equal(peer.family, undefined);

      assert(buffer.equals(peer.toBuffer()));
    });
  });

  describe('.equals()', () => {
    it('should compare with IPv4 rinfo', () => {
      const rinfo = {
        address: '83.54.192.20',
        port: 15921,
        family: 'IPv4',
      };

      const rinfo2 = {
        address: '83.54.192.21',
        port: 15921,
        family: 'IPv4',
      };

      const rinfo3 = {
        address: '83.54.192.20',
        port: 15922,
        family: 'IPv4',
      };

      const peer = new Peer(rinfo);
      assert(peer instanceof Peer);

      assert.equal(Peer.equals(peer, rinfo), true);
      assert.equal(Peer.equals(peer, rinfo2), false);
      assert.equal(Peer.equals(peer, rinfo3), false);
    });

    it('should compare with IPv6 rinfo', () => {
      const rinfo = {
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        port: 3940,
        family: 'IPv6',
      };

      const rinfo2 = {
        address: '2001:db8:85a3::8a2e:370:7334',
        port: 3940,
        family: 'IPv6',
      };

      const rinfo3 = {
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7335',
        port: 3940,
        family: 'IPv6',
      };

      const peer = new Peer(rinfo);
      assert(peer instanceof Peer);

      assert.equal(Peer.equals(peer, rinfo), true);
      assert.equal(Peer.equals(peer, rinfo2), true);
      assert.equal(Peer.equals(peer, rinfo3), false);
    });

    it('should compare with peer', () => {
      const rinfo = {
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        port: 3940,
        family: 'IPv6',
      };

      const rinfo2 = {
        address: '2001:db8:85a3::8a2e:370:7334',
        port: 3940,
        family: 'IPv6',
      };

      const peer = new Peer(rinfo);
      assert(peer instanceof Peer);

      const peer2 = new Peer(rinfo2);
      assert(peer2 instanceof Peer);

      assert.notStrictEqual(peer, peer2);
      assert.equal(Peer.equals(peer, peer2), true);
    });
  });

  describe('.rinfoKey()', () => {
    it('should work with IPv4', () => {
      const rinfo = {
        address: '83.54.192.20',
        port: 15921,
        family: 'IPv4',
      };

      assert.equal(Peer.rinfoKey(rinfo), `${rinfo.address}:${rinfo.port}`);
    });

    it('should work with IPv6', () => {
      const rinfo = {
        address: '2001:db8:85a3::8a2e:370:7334',
        port: 3940,
        family: 'IPv6',
      };

      assert.equal(Peer.rinfoKey(rinfo), `${rinfo.address}:${rinfo.port}`);
    });

    it('should work with IPv6 normalize address', () => {
      const rinfo = {
        address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        port: 3940,
        family: 'IPv6',
      };
      const shortAddress = '2001:db8:85a3::8a2e:370:7334';

      assert.equal(Peer.rinfoKey(rinfo), `${shortAddress}:${rinfo.port}`);
    });
  });

  describe('.normalizeAddress()', () => {
    it('should work with IPv4', () => {
      const address = '83.54.192.20';

      assert.equal(Peer.normalizeAddress(address), address);
    });

    it('should work with IPv6', () => {
      const address = '2001:db8:85a3::8a2e:370:7334';
      const fullAddress = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';

      assert.equal(Peer.normalizeAddress(address), address);
      assert.equal(Peer.normalizeAddress(fullAddress), address);
    });

    it('should work with special addresses', () => {
      const addresses = [
        ['127.0.0.1', '127.0.0.1'],
        ['001.0.0.1', '1.0.0.1'],
        ['::0:1', '::1'],
        ['0001:0000:0000:0000:0000:0000:0000:0001', '1::1'],
      ];

      for (const i of addresses) {
        assert.equal(Peer.normalizeAddress(i[0]), i[1], `${i[0]} => ${i[1]}`);
      }
    });
  });

  describe('instance', () => {
    describe('.key', () => {
      it('should work with IPv4', () => {
        const rinfo = {
          address: '83.54.192.20',
          port: 15921,
          family: 'IPv4',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        assert.equal(peer.key, Peer.rinfoKey(rinfo));
      });

      it('should work with IPv6', () => {
        const rinfo = {
          address: '2001:db8:85a3::8a2e:370:7334',
          port: 3940,
          family: 'IPv6',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        assert.equal(peer.key, Peer.rinfoKey(rinfo));
      });
    });

    describe('.toBuffer()', () => {
      it('should create from IPv4 buffer', () => {
        const rinfo = {
          address: '83.54.192.20',
          port: 15921,
          family: 'IPv4',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        const buffer = peer.toBuffer();
        assert(buffer instanceof Buffer);
        assert.equal(buffer.length, 6);

        assert.deepEqual(buffer.slice(0, buffer.length - 2), peer.address.split('.').map(str => parseInt(str, 10)));
        assert.equal(buffer.readUInt16BE(buffer.length - 2), peer.port);
      });

      it('should create from IPv6 buffer', () => {
        const rinfo = {
          address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          port: 15921,
          family: 'IPv4',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        const buffer = peer.toBuffer();
        assert(buffer instanceof Buffer);
        assert.equal(buffer.length, 18);

        assert.equal(buffer.slice(0, buffer.length - 2).toString('hex'), rinfo.address.split(':').join(''));
        assert.equal(buffer.readUInt16BE(buffer.length - 2), peer.port);
      });
    });

    describe('.equals()', () => {
      it('should compare with IPv4 rinfo', () => {
        const rinfo = {
          address: '83.54.192.20',
          port: 15921,
          family: 'IPv4',
        };

        const rinfo2 = {
          address: '83.54.192.21',
          port: 15921,
          family: 'IPv4',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        assert.equal(peer.equals(rinfo), true);
        assert.equal(peer.equals(rinfo2), false);
      });

      it('should compare with IPv6 rinfo', () => {
        const rinfo = {
          address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          port: 3940,
          family: 'IPv6',
        };

        const rinfo2 = {
          address: '2001:0db8:85a3:0000:0000:8a2e:0370:7335',
          port: 3940,
          family: 'IPv6',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        assert.equal(peer.equals(rinfo), true);
        assert.equal(peer.equals(rinfo2), false);
      });

      it('should compare with peer', () => {
        const rinfo = {
          address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          port: 3940,
          family: 'IPv6',
        };

        const rinfo2 = {
          address: '2001:db8:85a3::8a2e:370:7334',
          port: 3940,
          family: 'IPv6',
        };

        const peer = new Peer(rinfo);
        assert(peer instanceof Peer);

        const peer2 = new Peer(rinfo2);
        assert(peer2 instanceof Peer);

        assert.notStrictEqual(peer, peer2);
        assert.equal(peer.equals(peer2), true);
      });
    });
  });
});
