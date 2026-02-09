const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', () => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = { players: [socket.id] };
        socket.join(roomCode);
        socket.emit('room_created', { roomCode, role: 'host' });
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    socket.on('join_room', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomCode);
            socket.emit('room_joined', { roomCode, role: 'guest' });
            io.to(roomCode).emit('opponent_joined');
            console.log(`User ${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('error_msg', { message: 'Room full or does not exist.' });
        }
    });

    socket.on('game_action', (data) => {
        // Broadcast to everyone in the room EXCEPT sender
        socket.to(data.roomCode).emit('game_action', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Optional: Clean up empty rooms
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});