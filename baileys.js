// baileys.js
// Owns the WhatsApp socket: connecting, pairing, reconnecting, and
// routing incoming messages to the command files in /commands.

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { loadCommands } = require('./commands');

const AUTH_FOLDER = './auth_info';
const PREFIX = '!';

// Shared state the web UI reads from (see server.js).
const state = {
  sock: null,
  status: 'disconnected', // disconnected | connecting | paired | ready
  pairingCode: null,
};

const commands = loadCommands();

async function startBot() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    // We handle pairing code ourselves (via the web UI), so no QR in the terminal.
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Minimal Bot', 'Chrome', '1.0.0'],
  });

  state.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      state.status = 'connecting';
    }

    if (connection === 'open') {
      state.status = 'ready';
      state.pairingCode = null;
      console.log('[bot] connected to WhatsApp');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      state.status = 'disconnected';
      console.log(
        `[bot] connection closed (${statusCode || 'unknown'}). ` +
          (loggedOut ? 'Logged out — delete ./auth_info to re-link.' : 'Reconnecting...')
      );

      if (!loggedOut) {
        startBot();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    if (!text.startsWith(PREFIX)) return;

    const [cmdName, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
    const command = commands.get(cmdName.toLowerCase());
    if (!command) return;

    const jid = msg.key.remoteJid;
    try {
      await command.execute({ sock, msg, args, jid, commands });
    } catch (err) {
      console.error(`[bot] command "${cmdName}" failed:`, err);
      await sock.sendMessage(jid, { text: 'Something went wrong running that command.' });
    }
  });

  return sock;
}

// Called by the web UI once the user submits a phone number.
// Baileys requires the socket to exist (and not yet be registered) before requesting a code.
async function requestPairingCode(phoneNumber) {
  if (!state.sock) throw new Error('Bot is not initialized yet.');
  if (state.sock.authState?.creds?.registered) {
    throw new Error('Already linked. Delete ./auth_info to re-link a new number.');
  }

  const cleaned = phoneNumber.replace(/[^0-9]/g, '');
  const code = await state.sock.requestPairingCode(cleaned);
  state.pairingCode = code;
  return code;
}

module.exports = { startBot, requestPairingCode, state };
