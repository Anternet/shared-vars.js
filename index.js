const SharedVars = require('./lib/shared-vars');
const SharedVar = require('./lib/shared-var');
const Signature = require('./lib/signature');
const Peer = require('./lib/peer');

// export classes
exports.SharedVars = SharedVars;
exports.SharedVar = SharedVar;
exports.Signature = Signature;
exports.Peer = Peer;

// global parser instance
exports.parser = SharedVars.parser;

// helper functions
exports.generateSecret = callback => Signature.generatePrivateKey(callback);
exports.getId = secret => Signature.getPublicKey(secret);
