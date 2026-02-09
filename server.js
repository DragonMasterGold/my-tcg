const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// This tells Express to serve all your files (css, js, images)
app.use(express.static(__dirname)); 

// This fixes the "Cannot GET /" error by sending your main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); 
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', () => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = { players: [socket.id] };
        socket.join(roomCode);
        socket.emit('room_created', { roomCode, role: 'host' });
        console.log(`Room ${roomCode} created`);
    });

    socket.on('join_room', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomCode);
            socket.emit('room_joined', { roomCode, role: 'guest' });
            io.to(roomCode).emit('opponent_joined');
        } else {
            socket.emit('error_msg', { message: 'Room full or does not exist.' });
        }
    });

    socket.on('game_action', (data) => {
        if (data.roomCode) {
            socket.to(data.roomCode).emit('game_action', data);
        }
    });

    socket.on('disconnect', () => {
        for (const code in rooms) {
            if (rooms[code].players.includes(socket.id)) {
                socket.to(code).emit('opponent_disconnected');
                delete rooms[code];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});