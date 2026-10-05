// baileys.js
// Owns the WhatsApp socket: connecting, pairing, reconnecting, and
// routing incoming messages to the command files in /commands.

const fs = require('fs');
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
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_COMMAND_COOLDOWN_MS = 3000; // 3s per command per chat

let reconnectAttempts = 0;
const commandCooldowns = new Map();

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
      reconnectAttempts = 0;
      console.log('[bot] connected to WhatsApp');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      state.status = 'disconnected';
      console.log(
        `[bot] connection closed (${statusCode || 'unknown'}). ` +
          (loggedOut ? 'Logged out — delete ./auth_info to re-link.' : 'Disconnect event received.')
      );

      if (!loggedOut) {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error(`[bot] max reconnection attempts reached (${MAX_RECONNECT_ATTEMPTS}). Manual restart required.`);
          return;
        }

        reconnectAttempts++;
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
          MAX_RECONNECT_DELAY_MS
        );
        console.log(`[bot] reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(() => {
          startBot().catch((err) => console.error('[bot] reconnection error:', err));
        }, delay);
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

    // Check in-memory cooldown per command per chat (JID)
    const cooldownKey = `${command.name.toLowerCase()}:${jid}`;
    const now = Date.now();
    const cooldownMs = (command.cooldownMs !== undefined) ? command.cooldownMs : DEFAULT_COMMAND_COOLDOWN_MS;

    if (commandCooldowns.has(cooldownKey)) {
      const expirationTime = commandCooldowns.get(cooldownKey) + cooldownMs;
      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
        console.log(`[bot] Cooldown active for "${command.name}" in chat ${jid} (${timeLeft}s remaining)`);
        return;
      }
    }

    commandCooldowns.set(cooldownKey, now);
    setTimeout(() => commandCooldowns.delete(cooldownKey), cooldownMs);

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
  if (!state.sock) {
    throw new Error('Bot is not initialized yet.');
  }
  if (state.sock.authState?.creds?.registered) {
    throw new Error('Already linked. Delete ./auth_info or use /api/logout to re-link a new number.');
  }
  if (state.status !== 'connecting') {
    throw new Error(`Cannot request pairing code while status is "${state.status}". Socket must be in connecting state.`);
  }

  const cleaned = phoneNumber.replace(/[^0-9]/g, '');
  if (!cleaned) {
    throw new Error('Invalid phone number format.');
  }

  try {
    const code = await state.sock.requestPairingCode(cleaned);
    if (!code) {
      throw new Error('Failed to obtain pairing code from WhatsApp.');
    }
    state.pairingCode = code;
    return code;
  } catch (err) {
    console.error('[bot] requestPairingCode error:', err);
    throw new Error(err.message || 'Failed to request pairing code.');
  }
}

async function logoutBot() {
  if (state.sock) {
    try {
      await state.sock.logout();
    } catch (err) {
      try {
        state.sock.end(undefined);
      } catch (e) {
        // Ignore errors when ending socket
      }
    }
  }

  state.sock = null;
  state.status = 'disconnected';
  state.pairingCode = null;
  reconnectAttempts = 0;

  if (fs.existsSync(AUTH_FOLDER)) {
    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
  }

  // Re-start bot socket with clean state ready for pairing
  await startBot();
}

module.exports = { startBot, requestPairingCode, logoutBot, state };
