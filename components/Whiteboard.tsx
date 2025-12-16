'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import { useStore } from '@/store/useStore';

let socket: Socket;

interface LineData {
  tool: string;
  points: number[];
  color: string;
  strokeWidth: number;
}

export default function Whiteboard({ roomId }: { roomId: string }) {
  const [lines, setLines] = useState<LineData[]>([]);
  const isDrawing = useRef(false);
  const { tool, color, strokeWidth } = useStore();
  
  // Initialize Socket
  useEffect(() => {
    socket = io(); // Connects to the same host/port by default
    
    socket.emit('join-room', roomId);

    socket.on('draw-line', (newLine: LineData) => {
      setLines((prev) => [...prev, newLine]);
    });

    socket.on('clear-canvas', () => {
      setLines([]);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const newLine = {
      tool,
      points: [pos.x, pos.y],
      color: tool === 'eraser' ? '#ffffff' : color, // Simple eraser logic
      strokeWidth: tool === 'eraser' ? 20 : strokeWidth,
    };
    
    // Add locally immediately
    setLines([...lines, newLine]);
  };

  const handleMouseMove = (e: any) => {
    // Send cursor position (omitted for brevity, but goes here)
    
    if (!isDrawing.current) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    // Update the last line
    const lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    
    // Update local state efficiently
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());
    
    // Emit only the *new* points or the whole line (throttling recommended for prod)
    // For simplicity, we sync the final line on MouseUp, but here we could emit live.
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    // Broadcast the finished line to others
    socket.emit('draw-line', { roomId, line: lines[lines.length - 1] });
  };

  return (
    <div className="border bg-white shadow-lg overflow-hidden">
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
        <Layer>
          {lines.map((line, i) => (
            <Line
              key={i}
              points={line.points}
              stroke={line.color}
              strokeWidth={line.strokeWidth}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}