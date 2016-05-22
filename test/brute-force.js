const assert = require('assert');
const SharedVars = require('../lib/shared-vars');
const { describe, it, beforeEach, afterEach } = global;

describe('Brute force', () => {
  it('should sync assign var', (done) => {
    const address = '127.0.0.1';
    const port = 12345;
    const testValue = { foo: 1, bar: 'hi' };

    const shared = new SharedVars();
    const localVar = shared.assign(testValue);
    assert.deepEqual(localVar.value, testValue);

    shared.bind(port);

    const shared2 = new SharedVars();
    shared2.ping({ address, port });

    const remoteVar = shared2.get(localVar.id);

    remoteVar.once('update', timestamp => {
      assert(timestamp instanceof Date);
      assert.deepEqual(remoteVar.value, localVar.value);

      shared.close();
      shared2.close();

      done();
    });
  });
});
