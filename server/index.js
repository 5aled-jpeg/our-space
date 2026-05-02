import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // We'll allow all for now, can be restricted later
    methods: ["GET", "POST"]
  }
});

// Store room data in memory (for now)
// In a production app with many users, you'd use Redis
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. Create a new room
  socket.on('create-room', () => {
    const roomId = nanoid(10); // Generate a readable 10-char ID
    socket.join(roomId);
    rooms.set(roomId, { host: socket.id, users: [socket.id] });
    socket.emit('room-created', roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  // 2. Join an existing room
  socket.on('join-room', (roomId) => {
    if (io.sockets.adapter.rooms.has(roomId)) {
      socket.join(roomId);
      const room = rooms.get(roomId) || { users: [] };
      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }
      rooms.set(roomId, room);
      
      socket.emit('joined-successfully', roomId);
      // Notify others in the room
      socket.to(roomId).emit('user-joined', socket.id);
      console.log(`User ${socket.id} joined room: ${roomId}`);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  // 3. Sync Canvas Events (Drawing, Moving, etc.)
  // We use "volatile" for high-frequency data like mouse moves to save bandwidth
  socket.on('canvas-update', ({ roomId, data }) => {
    socket.to(roomId).emit('canvas-update', data);
  });

  // 4. P2P Signaling (WebRTC)
  // This helps peers find each other to start direct 700MB file transfers
  socket.on('signal', ({ roomId, to, signal }) => {
    if (to) {
      io.to(to).emit('signal', { from: socket.id, signal });
    } else {
      socket.to(roomId).emit('signal', { from: socket.id, signal });
    }
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        socket.to(roomId).emit('user-left', socket.id);
        const room = rooms.get(roomId);
        if (room) {
          room.users = room.users.filter(id => id !== socket.id);
          if (room.users.length === 0) rooms.delete(roomId);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Vision Server running on port ${PORT}`);
});
