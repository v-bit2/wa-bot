// server.js
// A tiny HTTP server using native Node.js http module (no Express):
// serves public/index.html + pairing API (/api/status, /api/pair, /api/logout).

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // Static route: GET / or /index.html
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const filePath = path.join(__dirname, 'public', 'index.html');
      fs.readFile(filePath, (err, content) => {
        if (err) {
          return sendJson(res, 500, { error: 'Failed to load UI' });
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    // API route: GET /api/status
    if (method === 'GET' && pathname === '/api/status') {
      return sendJson(res, 200, { status: state.status, pairingCode: state.pairingCode });
    }

    // API route: POST /api/pair
    if (method === 'POST' && pathname === '/api/pair') {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      if (!checkPairRateLimit(clientIp)) {
        return sendJson(res, 429, { error: 'Too many pairing requests. Please wait a few minutes before trying again.' });
      }

      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }

      const { phoneNumber } = body;
      if (!phoneNumber) {
        return sendJson(res, 400, { error: 'phoneNumber is required (with country code, digits only, no +)' });
      }

      if (!isValidPhoneNumber(phoneNumber)) {
        return sendJson(res, 400, { error: 'Invalid phone number format. It must contain digits only, including country code (7 to 15 digits, no +, spaces, or special characters).' });
      }

      try {
        const code = await requestPairingCode(phoneNumber);
        return sendJson(res, 200, { code });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // API route: POST /api/logout
    if (method === 'POST' && pathname === '/api/logout') {
      try {
        await logoutBot();
        return sendJson(res, 200, { success: true, message: 'Logged out successfully and auth state cleared.' });
      } catch (err) {
        return sendJson(res, 500, { error: err.message || 'Failed to logout.' });
      }
    }

    // Fallback 404
    sendJson(res, 404, { error: 'Not found' });
  });

  return server;
}

module.exports = { createServer };
