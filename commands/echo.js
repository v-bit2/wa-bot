module.exports = {
  name: 'echo',
  description: 'Repeat back whatever you type after the command',
  async execute({ sock, jid, args }) {
    const text = args.join(' ') || '(nothing to echo)';
    await sock.sendMessage(jid, { text });
  },
};
