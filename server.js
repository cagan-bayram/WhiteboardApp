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

  const io = new Server(httpServer, {
    // Bucket fills are stored as full-canvas PNG data URLs, so a single shape can
    // run to hundreds of KB and a whole-board snapshot to several MB. socket.io's
    // 1MB default doesn't error on an oversized payload — it disconnects the
    // sender — which would show up as a board that mysteriously drops its
    // connection after a couple of fills.
    maxHttpBufferSize: 1e7,
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join a specific room (board), and arrange a state handoff. A client that
    // joins mid-session would otherwise see only what Supabase had saved plus
    // whatever is relayed from this moment on, so it would start behind its peers
    // and stay behind. Asking a peer for a snapshot keeps this file a dumb relay:
    // the shapes travel through as an opaque payload, and only the clients know
    // what one means.
    socket.on('join-room', (roomId) => {
      // Pick the donor before joining, otherwise the room already contains this
      // socket and it could be asked to seed itself.
      const members = io.sockets.adapter.rooms.get(roomId);
      const donorId = members ? members.values().next().value : null;

      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);

      // An empty room means nobody has newer state than Supabase, so the joiner's
      // own load is already correct and no handoff is needed.
      if (donorId) {
        io.to(donorId).emit('request-state', { requesterId: socket.id });
      }
    });

    // The donor's reply, forwarded to the one client that asked for it. If the
    // donor disconnected in between, `io.to` on a dead id is a no-op and the
    // joiner simply keeps its Supabase content — the pre-existing behaviour.
    socket.on('provide-state', ({ requesterId, shapes }) => {
      io.to(requesterId).emit('board-state', shapes);
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
    
    socket.on('draw-shape', ({ roomId, shape }) => {
      // Broadcast to everyone else in the room
      socket.to(roomId).emit('draw-shape', shape);
    });

    socket.on('update-shape', ({ roomId, id, shape }) => {
      socket.to(roomId).emit('update-shape', { id, shape });
    });

    socket.on('delete-shape', ({ roomId, id }) => {
      socket.to(roomId).emit('delete-shape', { id });
    });

    socket.on('prepend-shape', ({ roomId, shape }) => {
      socket.to(roomId).emit('prepend-shape', shape);
    });

    // Undoing a delete puts the shape back at its original depth, so peers need
    // the index too — 'draw-shape' would append it and reorder their board.
    socket.on('insert-shape', ({ roomId, index, shape }) => {
      socket.to(roomId).emit('insert-shape', { index, shape });
    });

    // A z-order change. Carries the whole id sequence rather than "move shape X up
    // one", because indices only mean the same thing on two boards that already
    // agree — and a peer mid-stroke doesn't. Ids are cheap enough to send in full.
    socket.on('reorder-shapes', ({ roomId, ids }) => {
      socket.to(roomId).emit('reorder-shapes', ids);
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