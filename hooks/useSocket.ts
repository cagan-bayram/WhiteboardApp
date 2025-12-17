import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket;

export const useSocket = (roomId: string) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) {
      socket = io();
    }

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-room', roomId);
    });

    socket.on('disconnect', () => setIsConnected(false));

    return () => {
      // Don't disconnect here if you want to keep it alive across re-renders,
      // but strictly speaking for React 18 strict mode, you might want to cleanup.
    };
  }, [roomId]);

  return { socket, isConnected };
};