const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store room information
const rooms = new Map();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Join room
    socket.on('join-room', (data) => {
        const { roomId, username } = data;
        
        // Store user info
        socket.username = username;
        socket.roomId = roomId;
        
        // Join the room
        socket.join(roomId);
        
        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: [],
                currentVideo: null,
                isPlaying: false,
                currentTime: 0,
                playbackRate: 1,
                quality: 'auto'
            });
        }
        
        const room = rooms.get(roomId);
        room.users.push({ id: socket.id, username });
        
        // Notify others in the room
        socket.to(roomId).emit('user-connected', { username });
        
        // Send room state to new user
        socket.emit('room-state', {
            users: room.users.filter(u => u.id !== socket.id),
            currentVideo: room.currentVideo,
            playbackState: {
                isPlaying: room.isPlaying,
                currentTime: room.currentTime,
                playbackRate: room.playbackRate,
                quality: room.quality
            }
        });
        
        console.log(`${username} joined room ${roomId}`);
    });
    
    // Video playback controls
    socket.on('playback-control', (data) => {
        if (!socket.roomId) return;
        
        const room = rooms.get(socket.roomId);
        if (!room) return;
        
        // Update room state
        room.isPlaying = data.isPlaying;
        if (data.currentTime !== undefined) {
            room.currentTime = data.currentTime;
        }
        if (data.playbackRate !== undefined) {
            room.playbackRate = data.playbackRate;
        }
        if (data.quality !== undefined) {
            room.quality = data.quality;
        }
        
        // Broadcast to other users in the room
        socket.to(socket.roomId).emit('playback-update', data);
    });
    
    // Video change
    socket.on('video-change', (data) => {
        if (!socket.roomId) return;
        
        const room = rooms.get(socket.roomId);
        if (!room) return;
        
        // Update room state
        room.currentVideo = data.videoId;
        room.currentTime = 0;
        room.isPlaying = true;
        
        // Broadcast to other users
        socket.to(socket.roomId).emit('video-updated', data);
    });
    
    // Real-time chat message
    socket.on('chat-message', (data) => {
        if (!socket.roomId) return;
        
        // Broadcast to other users in the room
        socket.to(socket.roomId).emit('chat-message', {
            username: socket.username,
            message: data.message,
            timestamp: new Date().toISOString()
        });
    });

    // --- WebRTC Voice Chat Signaling ---
    socket.on('voice-offer', ({ to, offer }) => {
        io.to(to).emit('voice-offer', { from: socket.id, offer });
    });
    
    socket.on('voice-answer', ({ to, answer }) => {
        io.to(to).emit('voice-answer', { from: socket.id, answer });
    });
    
    socket.on('voice-candidate', ({ to, candidate }) => {
        io.to(to).emit('voice-candidate', { from: socket.id, candidate });
    });
    
    socket.on('start-voice', ({ roomId }) => {
        // Get all users in the room
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Send voice offer to all other users in the room
        room.users.forEach(user => {
            if (user.id !== socket.id) {
                socket.emit('voice-offer', { to: user.id });
            }
        });
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        if (socket.roomId && socket.username) {
            const room = rooms.get(socket.roomId);
            if (room) {
                // Remove user from room
                room.users = room.users.filter(u => u.id !== socket.id);
                
                // Notify others
                socket.to(socket.roomId).emit('user-disconnected', { 
                    username: socket.username,
                    id: socket.id 
                });
                
                // Clean up empty rooms
                if (room.users.length === 0) {
                    rooms.delete(socket.roomId);
                }
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the app at http://localhost:${PORT}`);
});
