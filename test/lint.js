const lint = require('mocha-eslint');

const paths = [
  'lib',
  'test',
];

lint(paths, {
  alwaysWarn: false,
  timeout: 5000,
});
