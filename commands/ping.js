module.exports = {
  name: 'ping',
  description: 'Check if the bot is alive',
  async execute({ sock, jid }) {
    const start = Date.now();
    await sock.sendMessage(jid, { text: `Pong! (${Date.now() - start}ms)` });
  },
};
