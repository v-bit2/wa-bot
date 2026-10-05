# Deployment Guide

This WhatsApp bot is built with `@whiskeysockets/baileys` and Express. To function properly, it requires a **long-running Node.js process** with a **persistent filesystem**.

---

## Technical Requirements

1. **Persistent WebSocket Connection**: Baileys maintains a continuous, long-lived WebSocket connection to WhatsApp servers to send and receive messages in real time.
2. **Persistent Storage**: Session credentials are stored in `./auth_info/`. This state must persist across process restarts so the bot stays authenticated without requiring phone re-pairing.

---

## Supported Hosting Platforms

The following platforms support persistent storage and continuous background Node.js processes:

- **Railway**: Deploy as a standard web service and attach a Persistent Volume to `./auth_info`.
- **Render**: Deploy as a Web Service and configure a Persistent Disk for the session directory.
- **Fly.io**: Deploy using Docker or Node runtime with a Fly Volume mounted at `./auth_info`.
- **VPS (DigitalOcean, Hetzner, AWS EC2, Linode)**: Run directly on a Virtual Private Server managed with a process manager like `pm2` or `systemd`.

---

## Incompatible Platforms (Serverless)

Serverless platforms like **Vercel**, **Netlify Functions**, **AWS Lambda**, and **Cloudflare Workers** **will NOT work** for this bot.

### Why Serverless Fails:

1. **Ephemeral Filesystem**: Serverless instances spin up and down dynamically. Any session files saved in `./auth_info/` are discarded when the instance terminates, breaking authentication and requiring re-pairing every request.
2. **Short Execution Lifetimes**: Serverless functions are designed for quick HTTP request/response cycles (typically timing out after 10–60 seconds). They cannot run continuous background loops or WebSocket listeners.
3. **Stateless Nature**: Baileys requires a stateful, long-lived process to receive real-time socket events (`messages.upsert`, `connection.update`). Serverless functions cannot maintain persistent socket connections.
