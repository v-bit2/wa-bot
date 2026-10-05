// server.js
// A tiny Express app: one page to enter a phone number and get a pairing
// code, plus a status endpoint the page polls. This is the only "UI" —
// no deploy panel, no QR scanning required.

const path = require('path');
const express = require('express');
const { requestPairingCode, logoutBot, state } = require('./baileys');

// Simple in-memory rate limiting for pairing requests
const pairRateLimitMap = new Map();
const PAIR_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const PAIR_MAX_REQUESTS = 5;

function checkPairRateLimit(ip) {
  const now = Date.now();
  const record = pairRateLimitMap.get(ip) || { count: 0, resetTime: now + PAIR_RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + PAIR_RATE_LIMIT_WINDOW_MS;
  }

  if (record.count >= PAIR_MAX_REQUESTS) {
    return false;
  }

  record.count += 1;
  pairRateLimitMap.set(ip, record);
  return true;
}

function isValidPhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== 'string') return false;
  // Digits only, country code required (E.164 without +), length between 7 and 15 digits
  return /^\d{7,15}$/.test(phoneNumber);
}

function createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/status', (req, res) => {
    res.json({ status: state.status, pairingCode: state.pairingCode });
  });

  app.post('/api/pair', async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkPairRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many pairing requests. Please wait a few minutes before trying again.' });
    }

    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required (with country code, digits only, no +)' });
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format. It must contain digits only, including country code (7 to 15 digits, no +, spaces, or special characters).' });
    }

    try {
      const code = await requestPairingCode(phoneNumber);
      res.json({ code });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/logout', async (req, res) => {
    try {
      await logoutBot();
      res.json({ success: true, message: 'Logged out successfully and auth state cleared.' });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to logout.' });
    }
  });

  return app;
}

module.exports = { createServer };
