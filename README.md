# shared-vars.js

[![Join the chat at https://gitter.im/Anternet/shared-vars.js](https://badges.gitter.im/Anternet/shared-vars.js.svg)](https://gitter.im/Anternet/shared-vars.js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

[![build](https://img.shields.io/travis/anternet/shared-vars.js.svg)](https://travis-ci.org/anternet/shared-vars.js)
[![npm](https://img.shields.io/npm/v/shared-vars.js.svg)](https://npmjs.org/package/shared-vars.js)
[![npm](https://img.shields.io/npm/dm/shared-vars.js.svg)](https://npmjs.org/package/shared-vars.js)
[![npm](https://img.shields.io/npm/l/shared-vars.js.svg)](LICENSE)

A Node.js library for sharing variables between 2 or more endpoints

***This library is under development***

## Example

```js
const shared = new SharedVars();
const localVar = shared.assign(5.68);
shared.listen(12345);

const shared2 = new SharedVars();
shared2.ping('127.0.0.1:12345');

const remoteVar = shared2.get(localVar.id);

remoteVar.once('update', timestamp => {
  assert.equal(remoteVar.value, 5.68);
});

try {
  remoteVar.set('hello');
} catch (err) {
  assert.equal(err.message, 'This reference is readonly');
}

assert.equal(localVar.isWritable, true);
localVar.forward('127.0.0.1:123123');

remoteVar.once('writable', () => {
  remoteVar.set('hello');
});

localVar.once('update', timestamp => {
  assert.equal(localVar.value, 'hello');
});
```

## License

[MIT License](LICENSE).
Copyright &copy; 2016 [Moshe Simantov](https://github.com/moshest)



