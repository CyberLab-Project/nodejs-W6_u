const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  throw new Error("JWT secret is not defined.");
}

const WINNING_COMBO = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const games = {}; // Stato dei giochi in memoria

// Verifica il vincitore
const checkWinner = (board) => {
  for (const [a, b, c] of WINNING_COMBO) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.includes("") ? null : "draw";
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://triswebapp.vercel.app", // URL del frontend in produzione
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("Nuovo client connesso", socket.id);

  socket.on("authenticate", (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.telegramId;
      console.log(`Utente autenticato: ${socket.userId}`);
    } catch (error) {
      console.error("Autenticazione fallita:", error);
      socket.emit("error", "Authentication failed");
    }
  });

  socket.on("createGame", () => {
    if (!socket.userId) {
      return socket.emit("error", "Authentication required");
    }

    const gameId = `game-${Math.random().toString(36).substr(2, 9)}`;
    games[gameId] = {
      board: Array(9).fill(""),
      currentPlayer: "X",
      winner: null,
      players: { X: socket.userId, O: null },
      active: false,
    };

    socket.join(gameId);
    socket.emit("gameCreated", { gameId, game: games[gameId] });
    console.log(`Partita creata: ${gameId}`);
  });

  socket.on("joinGame", (gameId) => {
    if (!socket.userId) {
      return socket.emit("error", "Authentication required");
    }

    const game = games[gameId];
    if (!game) {
      return socket.emit("error", "Game not found");
    }

    if (game.players.O) {
      return socket.emit("error", "Game already has two players");
    }

    game.players.O = socket.userId;
    game.active = true;

    socket.join(gameId);
    io.to(gameId).emit("gameUpdated", game);
    console.log(`Utente ${socket.userId} si è unito a ${gameId}`);
  });

  socket.on("makeMove", ({ gameId, index }) => {
    if (!socket.userId) {
      return socket.emit("error", "Authentication required");
    }

    const game = games[gameId];
    if (!game) {
      return socket.emit("error", "Game not found");
    }

    if (!game.active || game.winner) {
      return socket.emit("error", "Game is not active or already finished");
    }

    if (game.board[index]) {
      return socket.emit("error", "Cell already occupied");
    }

    if (socket.userId !== game.players[game.currentPlayer]) {
      return socket.emit("error", "Not your turn");
    }

    game.board[index] = game.currentPlayer;
    game.winner = checkWinner(game.board);
    game.currentPlayer = game.winner ? "X" : game.currentPlayer === "X" ? "O" : "X";

    io.to(gameId).emit("gameUpdated", game);
  });

  socket.on("resetGame", (gameId) => {
    const game = games[gameId];
    if (!game) {
      return socket.emit("error", "Game not found");
    }

    game.board = Array(9).fill("");
    game.currentPlayer = "X";
    game.winner = null;
    game.active = true;

    io.to(gameId).emit("gameUpdated", game);
    console.log(`Partita ${gameId} resettata`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnesso: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server Socket.IO in ascolto su porta ${PORT}`);
});
