# WA Bot (minimal)

A minimal WhatsApp bot built with Baileys. No QR scanning, no deploy panel —
just run it, open the web page, enter your number, and type the pairing
code into WhatsApp.

## Structure

```
wa-bot/
├── index.js          entrypoint — starts the bot + web UI together
├── baileys.js         WhatsApp socket: connect, pair, reconnect, route messages
├── server.js           tiny Express app serving the pairing page + API
├── public/
│   └── index.html      pairing UI (phone number → code)
├── commands/
│   ├── index.js         auto-loads every file in this folder
│   ├── ping.js
│   ├── menu.js
│   └── echo.js
└── auth_info/            session credentials (created automatically, gitignored)
```

## Run it

```bash
npm install
npm start
```

Then open `http://localhost:3000`, enter your phone number (country code,
digits only, e.g. `263771234567`), and type the 8-character code shown into
WhatsApp: **Settings → Linked Devices → Link a device → Link with phone
number instead**.

Once linked, the bot stays connected and keeps running in that same
process — nothing else to deploy or configure. Session credentials are
saved to `./auth_info`, so restarting the process reconnects automatically
without needing to pair again.

## Commands

Send these in any chat the linked number can see, prefixed with `!`:

- `!ping` — check the bot is alive
- `!menu` — list all commands
- `!echo <text>` — repeats back what you type

## Adding a command

Drop a new file in `commands/`:

```js
// commands/hello.js
module.exports = {
  name: 'hello',
  description: 'Say hello',
  async execute({ sock, jid }) {
    await sock.sendMessage(jid, { text: 'Hello!' });
  },
};
```

It's picked up automatically on the next start — no other file needs editing.

## Re-linking a different number

Stop the bot, delete the `auth_info/` folder, and start it again.
