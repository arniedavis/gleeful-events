/* Gleeful Events — Friendly Feud
   Tiny relay server: serves the game and keeps every connected device
   (admin, scoreboard, host/iPad) in sync over WebSocket.

   The admin panel is authoritative. It sends the game state, the question
   bank, and the settings; the server caches the latest of each and relays
   everything to the other devices. New devices get a snapshot on connect. */

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// health check (handy for uptime pingers to keep the free instance awake)
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// latest snapshot, cached so a device that connects later is caught up
const cache = { state: null, bank: null, config: null };

function broadcast(except, raw) {
  wss.clients.forEach((c) => {
    if (c !== except && c.readyState === 1) {
      try { c.send(raw); } catch (e) {}
    }
  });
}

wss.on('connection', (ws) => {
  // catch the new device up
  try { ws.send(JSON.stringify({ type: 'snapshot', payload: cache })); } catch (e) {}

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    const raw = data.toString();
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.type) return;
    // cache the authoritative pieces from the admin
    if (msg.type === 'state') cache.state = msg.payload;
    else if (msg.type === 'bank') cache.bank = msg.payload;
    else if (msg.type === 'config') cache.config = msg.payload;
    // relay everything (state/bank/config/sound/strike/buzzwin/hello/ping/key/…)
    broadcast(ws, raw);
  });
});

// drop dead connections so the client list stays clean
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Gleeful Events running on port ' + PORT));
