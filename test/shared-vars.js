const assert = require('assert');
const dgram = require('dgram');
const SharedVars = require('../lib/shared-vars');
const { describe, it, beforeEach, afterEach } = global;

describe('SharedVars', () => {
  describe('constructor', () => {
    it('should construct with no vars', () => {
      const sharedVars = new SharedVars();

      assert(sharedVars instanceof SharedVars);
      assert.equal(sharedVars.type, 'udp4');
    });

    it('should construct with udp6', () => {
      const sharedVars = new SharedVars({
        type: 'udp6',
      });

      assert(sharedVars instanceof SharedVars);
      assert.equal(sharedVars.type, 'udp6');
    });

    it('should construct with socket', () => {
      const socket = dgram.createSocket('udp4');

      const sharedVars = new SharedVars({
        socket,
      });

      assert(sharedVars instanceof SharedVars);
      assert.strictEqual(sharedVars.socket, socket);
    });
  });

  describe('.ping()', () => {
    const port = 3149;
    const address = '127.0.0.1';
    let p1;
    let p2;

    beforeEach(() => {
      p1 = new SharedVars();
      p1.bind(port, address);

      p2 = new SharedVars();
    });

    afterEach(() => {
      p1.close();
      p2.close();
    });

    it('should ping other instance', (done) => {
      let event = 0;

      p1.on('ping', (data, peer) => {
        assert.equal(event++, 0);

        assert(Array.isArray(data));

        assert.equal(peer.address, address);
        assert.equal(typeof peer.port, 'number');
      });

      p2.ping({ address, port }, (err, data, peer) => {
        if (err) return done(err);

        assert(Array.isArray(data));

        assert.equal(peer.address, address);
        assert.equal(peer.port, port);

        assert.equal(event, 1);
        done();
      });
    });
  });
});
