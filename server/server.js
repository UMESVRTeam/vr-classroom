require('dotenv').config();
const { AccessToken } = require('livekit-server-sdk');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve built output in production, raw public assets in dev
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

// Track connected players
const players = {};

const MAX_MOVE_SPEED = 3.75; // m/s — client max (2.5) × 1.5 tolerance for jitter

app.get('/livekit-token', async (req, res) => {
  const { identity } = req.query;
  if (!identity) return res.status(400).json({ error: 'identity required' });
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_SECRET,
    { identity, ttl: '1h' }
  );
  at.addGrant({ roomJoin: true, room: 'classroom', canPublish: true, canSubscribe: true });
  const token = await at.toJwt();
  res.json({ token, url: process.env.LIVEKIT_URL });
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Assign a spawn position
  players[socket.id] = {
    id: socket.id,
    position: { x: 1.8, y: 1.0, z: -2.5 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lastMoveTime: Date.now(),
  };

  // Send this player the current state of all other players
  socket.emit('currentPlayers', players);

  // Notify everyone else of the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Handle movement updates (binary: 28-byte ArrayBuffer, 7 × Float32)
  socket.on('playerMoved', (data) => {
    const p = players[socket.id];
    if (!p) return;
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const nx = v.getFloat32(0, true);
    const nz = v.getFloat32(8, true);
    if (!isFinite(nx) || !isFinite(nz)) return;
    const now = Date.now();
    const dt = Math.min((now - p.lastMoveTime) / 1000, 0.5);
    const dx = nx - p.position.x;
    const dz = nz - p.position.z;
    if (Math.sqrt(dx * dx + dz * dz) > MAX_MOVE_SPEED * dt) return;
    p.position = { x: nx, y: 1.0, z: nz };
    p.rotation = { x: v.getFloat32(12, true), y: v.getFloat32(16, true), z: v.getFloat32(20, true), w: v.getFloat32(24, true) };
    p.lastMoveTime = now;
    socket.broadcast.emit('playerMoved', { id: socket.id, data });
  });

  // Handle chat messages
  socket.on('chatMessage', (message) => {
    io.emit('chatMessage', { id: socket.id, message });
  });


  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
