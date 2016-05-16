const eslint = require('mocha-eslint');

const paths = [
  '*.js',
  'lib',
  'test',
];

eslint(paths, {
  alwaysWarn: false,
  timeout: 5000,
});
