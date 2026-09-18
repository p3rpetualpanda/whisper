const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
const users = new Map(); // socketId -> { name, socketId }
const rooms = new Map(); // roomId -> { id, name, members:Set, kind:'group'|'dm', names?:[] }

const LOBBY = 'lobby';
rooms.set(LOBBY, { id: LOBBY, name: 'Lobby', members: new Set(), kind: 'lobby' });

function dmRoomKey(a, b) {
  return 'dm-' + [a, b].sort().join('--');
}

function ensureDmRoom(a, b, nameA, nameB) {
  const id = dmRoomKey(a, b);
  if (!rooms.has(id)) {
    rooms.set(id, { id, name: 'DM', members: new Set(), kind: 'dm', names: [nameA, nameB] });
  }
  return id;
}

function onlineUsers() {
  return [...users.values()].map((u) => u.name).sort();
}

// Per-socket room list: resolves the DM peer name for the requesting socket
function roomListFor(socketId) {
  const me = users.get(socketId);
  return [...rooms.values()]
    .filter((r) => r.kind !== 'lobby')
    .map((r) => {
      const base = {
        id: r.id,
        name: r.name,
        kind: r.kind,
        members: r.members.size,
      };
      if (r.kind === 'dm') {
        base.peer = (r.names || []).find((n) => n !== (me && me.name)) || null;
      }
      return base;
    });
}

function findSocketByName(name) {
  for (const u of users.values()) {
    if (u.name === name) return io.sockets.sockets.get(u.socketId);
  }
  return null;
}

// Emit a per-socket room list to every connected socket
function broadcastRooms() {
  for (const [sid, sock] of io.sockets.sockets) {
    sock.emit('rooms-updated', { rooms: roomListFor(sid) });
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ name }, ack) => {
    name = String(name || '').trim().slice(0, 30);
    if (!name) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Name required' });
      return;
    }
    users.set(socket.id, { name, socketId: socket.id });
    socket.data.name = name;
    socket.join(LOBBY);
    rooms.get(LOBBY).members.add(socket.id);
    if (typeof ack === 'function') ack({ ok: true, name });
    io.emit('presence', { online: onlineUsers() });
    socket.to(LOBBY).emit('system', { text: `${name} joined the lobby`, ts: Date.now() });
  });

  socket.on('list', (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (ack) ack({ rooms: roomListFor(socket.id), online: onlineUsers() });
  });

  socket.on('create-room', ({ name }, ack) => {
    name = String(name || '').trim().slice(0, 30);
    if (!name) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Room name required' });
      return;
    }
    const id = 'room-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const room = { id, name, members: new Set([socket.id]), kind: 'group' };
    rooms.set(id, room);
    socket.join(id);
    if (typeof ack === 'function') ack({ ok: true, room: { id, name, members: 1 } });
    broadcastRooms();
  });

  socket.on('join-room', ({ roomId }, ack) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Room not found' });
      return;
    }
    socket.join(roomId);
    room.members.add(socket.id);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('leave-room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.kind === 'lobby') return;
    socket.leave(roomId);
    room.members.delete(socket.id);
    if (room.members.size === 0) {
      rooms.delete(roomId);
      broadcastRooms();
    }
  });

  socket.on('message', ({ roomId, text }, ack) => {
    const room = rooms.get(roomId);
    const sender = users.get(socket.id);
    if (!room || !sender) return;
    text = String(text || '').trim().slice(0, 2000);
    if (!text) return;
    const msg = {
      id: socket.id + '-' + Date.now(),
      roomId,
      sender: sender.name,
      text,
      ts: Date.now(),
    };
    io.to(roomId).emit('message', msg);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('dm-open', ({ to }, ack) => {
    const me = users.get(socket.id);
    if (!me || !to) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Missing user' });
      return;
    }
    const target = findSocketByName(to);
    if (!target) {
      if (typeof ack === 'function') ack({ ok: false, error: 'User not online' });
      return;
    }
    const roomId = ensureDmRoom(me.socketId, target.id, me.name, to);
    const room = rooms.get(roomId);
    room.members.add(me.socketId);
    room.members.add(target.id);
    socket.join(roomId);
    target.join(roomId);
    socket.emit('dm-opened', { roomId, peer: to });
    target.emit('dm-opened', { roomId, peer: me.name });
    broadcastRooms();
    if (typeof ack === 'function') ack({ ok: true, roomId, peer: to });
  });

  socket.on('typing', ({ roomId, typing }) => {
    const sender = users.get(socket.id);
    if (!sender) return;
    socket.to(roomId).emit('typing', { roomId, name: sender.name, typing: !!typing });
  });

  socket.on('disconnect', () => {
    const me = users.get(socket.id);
    if (!me) return;
    users.delete(socket.id);
    for (const room of rooms.values()) {
      room.members.delete(socket.id);
    }
    // Remove empty DM rooms
    for (const [id, room] of rooms) {
      if (room.members.size === 0 && room.kind !== 'lobby') rooms.delete(id);
    }
    io.emit('presence', { online: onlineUsers() });
    broadcastRooms();
    socket.to(LOBBY).emit('system', { text: `${me.name} left`, ts: Date.now() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Whisper running at http://localhost:${PORT}`);
});
