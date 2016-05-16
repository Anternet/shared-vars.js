const MsgPack = require('msgpack5');
const Signature = require('./signature');
const Peer = require('./peer');

// allowed values: 0..127
const PARSER_REG_PEER = 101;
const PARSER_REG_SIGNATURE = 102;


module.exports = () => {
  const parser = new MsgPack();

  // register classes
  parser.register(PARSER_REG_PEER, Peer, peer => peer.toBuffer(), buf => Peer.fromBuffer(buf));
  parser.register(PARSER_REG_SIGNATURE, Signature, sig => sig.toBuffer(), buf => Signature.fromBuffer(buf));

  return parser;
};
