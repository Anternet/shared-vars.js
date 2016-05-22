const assert = require('assert');
const crypto = require('crypto');
const Signature = require('../lib/signature');
const { describe, it } = global;

describe('Signature', () => {
  describe('.ID_LENGTH', () => {
    it('should return number', () => {
      assert.equal(typeof Signature.ID_LENGTH, 'number');
    });
  });

  describe('.generatePrivateKey()', () => {
    it('should create without callback (sync)', () => {
      const privateKey = Signature.generatePrivateKey();

      assert(privateKey instanceof Buffer);
    });

    it('should create with callback (async)', (done) => {
      Signature.generatePrivateKey((err, privateKey) => {
        assert.equal(err, null);

        assert(privateKey instanceof Buffer);
        done();
      });
    });
  });

  describe('.getPublicKey()', () => {
    it('should create from private key', () => {
      const privateKey = Signature.generatePrivateKey();
      const publicKey = Signature.getPublicKey(privateKey);

      assert(publicKey instanceof Buffer);
      assert.equal(publicKey.length, Signature.ID_LENGTH);
    });
  });

  describe('.createHash()', () => {
    it('should create a hash', () => {
      const hash = Signature.createHash();
      assert(hash instanceof crypto.Hash);

      const msg = Signature.generatePrivateKey();
      const buf = hash.update(msg).digest();

      assert(buf instanceof Buffer);
      assert.equal(buf.length, msg.length);
      assert.equal(buf.equals(msg), false);
    });
  });

  describe('.sign()', () => {
    it('should sign a random message', () => {
      const privateKey = Signature.generatePrivateKey();
      const valueHash = Signature.createHash().update(privateKey).digest();

      const now = Date.now();
      const sig = Signature.sign(privateKey, valueHash);
      assert(sig instanceof Signature);

      assert.equal(sig.verify(), true);

      assert(sig.publicKey instanceof Buffer);
      assert.equal(sig.publicKey.length, Signature.ID_LENGTH);

      assert(sig.valueHash instanceof Buffer);
      assert.equal(sig.valueHash.equals(valueHash), true);

      assert(sig.timestamp instanceof Date);
      assert(sig.timestamp.getTime() - now < 500);
      assert(now <= sig.timestamp.getTime());

      assert(sig.signature instanceof Buffer);
    });
  });

  describe('.fromBuffer()', () => {
    it('should create from predefined buffer', () => {
      const publicKey = '030ace68e48c8e08d1ad7d2394ea0600c6d077c4b7c097791521d891a3bc525ad3';
      const valueHash = '9f943d80e8fd2e2efb1aa4075de22e85cf5c12aa9ab124571a1f9266a5d9ef8b';
      const signature = 'cd028575647f85980e60b94bb2c0afe977a71b320d00799f8f023e22830a71d57bb3d1ce2bd3554e216b2dc' +
          '890d800c38b95c24c29d937e031b2884cd52b760e';
      const timestamp = 1463934024024;

      const timestampHex = '0154d94479580000';
      const pre = Buffer.from(publicKey + signature + timestampHex + valueHash, 'hex');

      const sig = Signature.fromBuffer(pre);
      assert(sig instanceof Signature);

      assert.equal(sig.verify(), true);

      assert(sig.publicKey instanceof Buffer);
      assert.equal(sig.publicKey.toString('hex'), publicKey);

      assert(sig.valueHash instanceof Buffer);
      assert.equal(sig.valueHash.toString('hex'), valueHash);

      assert(sig.timestamp instanceof Date);
      assert.equal(sig.timestamp.getTime(), timestamp);

      assert(sig.signature instanceof Buffer);
      assert.equal(sig.signature.toString('hex'), signature);

      assert.equal(sig.toBuffer().equals(pre), true);
    });
  });


  describe('instance', () => {
    describe('.toString()', () => {
      it('should return id string', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const idStr = sig.toString();

        assert.equal(typeof idStr, 'string');

        const sig2 = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig2.toString(), idStr);
      });
    });

    describe('.toBuffer()', () => {
      it('should be able to reproduce', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const buf = sig.toBuffer();
        assert(buf instanceof Buffer);

        const sig2 = Signature.fromBuffer(buf);
        assert(sig2 instanceof Signature);
        assert.notStrictEqual(sig2, sig);

        assert.equal(sig2.publicKey.equals(sig.publicKey), true);
        assert.equal(sig2.valueHash.equals(sig.valueHash), true);
        assert.equal(sig2.signature.equals(sig.signature), true);
        assert.equal(sig2.timestamp.getTime(), sig.timestamp.getTime());
        assert.equal(sig2.equals(sig), true);

        assert.equal(sig2.toBuffer().equals(buf), true);
      });
    });

    describe('.equals()', () => {
      it('should equal same object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.equals(sig), true);
      });

      it('should equal same data', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const sig2 = new Signature(sig.timestamp, sig.valueHash, sig.publicKey, sig.signature);

        assert.equal(sig.equals(sig2), true);
        assert.equal(sig2.equals(sig), true);
      });

      it('should not equal different timestamp', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const sig2 = Signature.sign(privateKey, valueHash, new Date(sig.timestamp.getTime() - 1));
        assert(sig instanceof Signature);

        assert.equal(sig.equals(sig2), false);
        assert.equal(sig2.equals(sig), false);
      });
    });

    describe('.verify()', () => {
      it('should verify sign object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.verify(), true);
      });

      it('should verify `fromBuffer` object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.verify(), true);

        const sig2 = Signature.fromBuffer(sig.toBuffer());
        assert.notStrictEqual(sig2, sig);

        assert.equal(sig2.verify(), true);
      });

      it('should not verify different timestamp', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.verify(), true);

        sig.timestamp = new Date(sig.timestamp.getTime() - 1);
        assert.equal(sig.verify(), false);
      });

      it('should not verify different valueHash', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.verify(), true);

        sig.valueHash[1] = (sig.valueHash[1] !== 0 ? 0 : 1);
        assert.equal(sig.verify(), false);
      });

      it('should not verify different publicKey', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.verify(), true);

        sig.publicKey = Signature.getPublicKey(Signature.generatePrivateKey());
        assert.equal(sig.verify(), false);
      });
    });

    describe('.betterThen()', () => {
      it('should be better from same object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.betterThen(sig), true);
      });

      it('should be better from older object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const oldSig = Signature.sign(privateKey, valueHash, new Date(sig.timestamp.getTime() - 1));
        assert(oldSig instanceof Signature);

        assert.equal(sig.betterThen(oldSig), true);
        assert.equal(oldSig.betterThen(sig), false);
      });
    });

    describe('.similarTo()', () => {
      it('should be similar to same object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        assert.equal(sig.similarTo(sig), true);
      });

      it('should be similar to older object', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const oldSig = Signature.sign(privateKey, valueHash, new Date(sig.timestamp.getTime() - 1));
        assert(oldSig instanceof Signature);

        assert.equal(sig.similarTo(oldSig), true);
        assert.equal(oldSig.similarTo(sig), true);
      });

      it('should not be similar when public key changed', () => {
        const privateKey = Signature.generatePrivateKey();
        const valueHash = Signature.createHash().update(privateKey).digest();

        const sig = Signature.sign(privateKey, valueHash);
        assert(sig instanceof Signature);

        const newPublicKey = Signature.getPublicKey(Signature.generatePrivateKey());
        const sig2 = new Signature(sig.timestamp, sig.valueHash, newPublicKey, sig.signature);

        assert.equal(sig.similarTo(sig2), false);
        assert.equal(sig2.similarTo(sig), false);
      });
    });
  });
});
