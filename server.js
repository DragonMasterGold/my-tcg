const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', () => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = { 
            players: [socket.id],
            host: socket.id,
            actionQueue: [],
            processing: false
        };
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit('room_created', { roomCode, role: 'host' });
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    socket.on('join_room', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.emit('room_joined', { roomCode, role: 'guest' });
            io.to(room.host).emit('opponent_joined');
            console.log(`User ${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('error_msg', { message: 'Room full or does not exist.' });
        }
    });

    socket.on('action', (data) => {
        const room = rooms[socket.roomCode];
        if (!room) return;
        
        // Add to queue
        room.actionQueue.push({ ...data, sender: socket.id });
        
        // Process queue if not already processing
        if (!room.processing) {
            processQueue(socket.roomCode);
        }
    });
    
    socket.on('sync_deck_ids', (deckData) => {
        // Host sends deck IDs to guest
        socket.to(socket.roomCode).emit('receive_deck_ids', deckData);
        console.log(`Deck IDs synced in room ${socket.roomCode}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.roomCode) {
            io.to(socket.roomCode).emit('opponent_disconnected');
            delete rooms[socket.roomCode];
        }
    });
});

function processQueue(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.actionQueue.length === 0) {
        room.processing = false;
        return;
    }
    
    room.processing = true;
    const action = room.actionQueue.shift();
    
    // Broadcast action to room
    io.to(roomCode).emit('action_apply', action);
    
    // Process next action after 50ms
    setTimeout(() => processQueue(roomCode), 50);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});