// index.js — entrypoint. Run with: node index.js
// Starts the Baileys socket and the pairing-code web UI together.
// If a previous session exists in ./auth_info, it reconnects automatically
// with no further action needed.

const { startBot } = require('./baileys');
const { createServer } = require('./server');

const PORT = process.env.PORT || 3000;

async function main() {
  await startBot();

  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[server] pairing UI running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
