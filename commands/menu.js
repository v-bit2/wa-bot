module.exports = {
  name: 'menu',
  description: 'List all available commands',
  async execute({ sock, jid, commands }) {
    const lines = [...commands.values()].map((c) => `!${c.name} — ${c.description}`);
    await sock.sendMessage(jid, { text: `*Commands*\n\n${lines.join('\n')}` });
  },
};
