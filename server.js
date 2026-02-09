// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');


const app = express();
app.use(cors());
app.use(express.static(__dirname)); 


const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from anywhere (for now)
        methods: ["GET", "POST"]
    }
});

// Store room data: { roomCode: { players: [socketId1, socketId2] } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create Room
    socket.on('create_room', () => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = { players: [socket.id] };
        socket.join(roomCode);
        socket.emit('room_created', { roomCode, role: 'host' });
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    // Join Room
    socket.on('join_room', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomCode);
            socket.emit('room_joined', { roomCode, role: 'guest' });
            // Notify host
            io.to(roomCode).emit('opponent_joined');
            console.log(`${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('error', { message: 'Room full or does not exist.' });
        }
    });

    // THE RELAY: This is the magic part.
    // When a player sends an action, we broadcast it to everyone else in the room.
    socket.on('game_action', (data) => {
        // data contains: { roomCode, actionType, payload }
        const { roomCode } = data;
        // Send to everyone in the room EXCEPT the sender
        socket.to(roomCode).emit('game_action', data);
    });

    // Disconnect
    socket.on('disconnect', () => {
        // Find room and clean up
        for (const code in rooms) {
            if (rooms[code].players.includes(socket.id)) {
                socket.to(code).emit('opponent_disconnected');
                delete rooms[code];
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});