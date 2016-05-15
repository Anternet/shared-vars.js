const SharedVars = require('./shared-vars');
const SharedVar = require('./shared-var');
const Signature = require('./signature');
const Peer = require('./peer');


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
