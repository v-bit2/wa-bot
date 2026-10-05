// server.js
// A tiny Express app: one page to enter a phone number and get a pairing
// code, plus a status endpoint the page polls. This is the only "UI" —
// no deploy panel, no QR scanning required.

const path = require('path');
const express = require('express');
const { requestPairingCode, state } = require('./baileys');

function createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/status', (req, res) => {
    res.json({ status: state.status, pairingCode: state.pairingCode });
  });

  app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required (with country code, no +)' });
    }
    try {
      const code = await requestPairingCode(phoneNumber);
      res.json({ code });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createServer };
