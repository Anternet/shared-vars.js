# SharedVars.js
A Node.js library for sharing variables between 2 or more endpoints

** This library is under development **

### Example

```js
const shared = new SharedVars();
const localVar = shared.assign(5.68);
shared.listen(12345);

const shared2 = new SharedVars();
shared2.connect('127.0.0.1:12345');

const remoteVar = shared2.get(localVar.id);

remoteVar.once('update', timestamp => {
  assert.equal(remoteVar.value, 5.68);
});

try {
  remoteVar.set('hello');
} catch (err) {
  assert.equal(err.message, 'This reference is readonly');
}

assert.equal(localVar.isWriteable, true);
localVar.forward('127.0.0.1:123123');

remoteVar.once('writeable', () => {
  remoteVar.set('hello');
});

localVar.once('update', timestamp => {
  assert.equal(localVar.value, 'hello');
});
```

## License

[MIT](LICENSE). Copyright &copy; 2016 [Moshe Simantov](https://github.com/moshest)


