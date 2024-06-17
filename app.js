const express = require('express');
const socket = require('socket.io');
const http = require('http');
const { Chess } = require('chess.js');
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server);

const rooms = {};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", { title: "Chess Game" });
});

io.on("connection", function (uniquesocket) {
    console.log("User connected");

    uniquesocket.on("createRoom", (roomName) => {
        if (rooms[roomName]) {
            uniquesocket.emit("error", "Room already exists");
            return;
        }

        rooms[roomName] = {
            chess: new Chess(),
            players: {
                white: null,
                black: null
            },
            spectators: []
        };

        joinRoom(uniquesocket, roomName);
    });

    uniquesocket.on("joinRoom", (roomName) => {
        if (!rooms[roomName]) {
            uniquesocket.emit("error", "Room does not exist");
            return;
        }

        joinRoom(uniquesocket, roomName);
    });

    uniquesocket.on("move", (move, roomName) => {
        try {
            const room = rooms[roomName];
            if (!room) return;

            const chess = room.chess;
            const playerRole = getPlayerRole(room, uniquesocket.id);

            if (chess.turn() === "w" && playerRole !== "white") return;
            if (chess.turn() === "b" && playerRole !== "black") return;

            const result = chess.move(move);

            if (result) {
                io.to(roomName).emit("move", move);
                io.to(roomName).emit("boardState", chess.fen());
            } else {
                uniquesocket.emit("invalidMove", move);
            }
        } catch (err) {
            console.log("Invalid Move");
        }
    });

    uniquesocket.on("spectatorResponse", (play, roomName) => {
        try {
            if (!rooms[roomName]) return;

            if (play) {
                const room = rooms[roomName];
                if (!room.players.white) {
                    room.players.white = uniquesocket.id;
                    uniquesocket.emit("PlayerRole", "w");
                } else if (!room.players.black) {
                    room.players.black = uniquesocket.id;
                    uniquesocket.emit("PlayerRole", "b");
                }
                room.spectators = room.spectators.filter(id => id !== uniquesocket.id);
            }
        } catch (err) {
            console.log("Spectator Can't Move");
        }
    });

    uniquesocket.on("disconnect", () => {
        console.log("User disconnected");
        for (let roomName in rooms) {
            const room = rooms[roomName];
            let playerRole = getPlayerRole(room, uniquesocket.id);
            if (playerRole) {
                if (playerRole === "white") {
                    room.players.white = null;
                    if (room.players.black) {
                        io.to(roomName).emit("opponentLeft", "black");
                    }
                } else if (playerRole === "black") {
                    room.players.black = null;
                    if (room.players.white) {
                        io.to(roomName).emit("opponentLeft", "white");
                    }
                }
            } else {
                room.spectators = room.spectators.filter(id => id !== uniquesocket.id);
            }

            if (!room.players.white && !room.players.black && room.spectators.length === 0) {
                delete rooms[roomName];
            }
        }
    });
});

const joinRoom = (uniquesocket, roomName) => {
    uniquesocket.join(roomName);
    const room = rooms[roomName];
    let role = null;

    if (!room.players.white) {
        room.players.white = uniquesocket.id;
        role = "w";
    } else if (!room.players.black) {
        room.players.black = uniquesocket.id;
        role = "b";
    } else {
        room.spectators.push(uniquesocket.id);
        role = "spectator";
    }

    uniquesocket.emit("PlayerRole", role);
    uniquesocket.emit("boardState", room.chess.fen());
    io.to(roomName).emit("userCount", room.players.white && room.players.black ? 2 : 1);
};

const getPlayerRole = (room, socketId) => {
    if (room.players.white === socketId) return "white";
    if (room.players.black === socketId) return "black";
    return null;
};

server.listen(3000, () => {
    console.log("Server live at port 3000");
});
