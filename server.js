const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join a specific room (board)
    socket.on('join-room', (roomId) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
    });

    // Handle drawing events
    socket.on('draw-line', ({ roomId, line }) => {
      // Broadcast to everyone else in the room
      socket.to(roomId).emit('draw-line', line);
    });

    // Handle cursor movement
    socket.on('cursor-move', ({ roomId, userId, x, y }) => {
      socket.to(roomId).emit('cursor-move', { userId, x, y });
    });

    // Handle clear canvas
    socket.on('clear-canvas', (roomId) => {
      socket.to(roomId).emit('clear-canvas');
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  httpServer.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});