const SharedVars = require('./shared-vars');
const SharedVar = require('./shared-var');
const Signature = require('./signature');
const Peer = require('./peer');


// export classes
exports.SharedVars = SharedVars;
exports.SharedVar = SharedVar;
exports.Signature = Signature;
exports.Peer = Peer;

// helper functions
exports.createSharedVars = (opts) => new SharedVars(opts);
exports.createPeer = (rinfo) => new Peer(rinfo);
