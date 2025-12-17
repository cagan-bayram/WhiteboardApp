'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle } from 'react-konva'; // Added Rect, Circle
import { io, Socket } from 'socket.io-client';
import { useStore } from '@/store/useStore';

let socket: Socket;

interface ShapeData {
  id: string;
  tool: string;
  points?: number[]; // For pencil lines
  x?: number;        // For shapes
  y?: number;        // For shapes
  width?: number;    // For rect
  height?: number;   // For rect
  radius?: number;   // For circle
  color: string;
  strokeWidth: number;
}

export default function Whiteboard({ roomId }: { roomId: string }) {
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const isDrawing = useRef(false);
  const { tool, color, strokeWidth } = useStore();
  
  useEffect(() => {
    socket = io(); 
    socket.emit('join-room', roomId);

    socket.on('draw-shape', (newShape: ShapeData) => {
      setShapes((prev) => [...prev, newShape]);
    });

    socket.on('clear-canvas', () => setShapes([]));

    return () => { socket.disconnect(); };
  }, [roomId]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const id = crypto.randomUUID(); // Unique ID for each shape

    let newShape: ShapeData;

    if (tool === 'pen' || tool === 'eraser') {
      newShape = {
        id,
        tool,
        points: [pos.x, pos.y],
        color: tool === 'eraser' ? '#ffffff' : color,
        strokeWidth: tool === 'eraser' ? 20 : strokeWidth,
      };
    } else {
      // Initialize shape at 0 size
      newShape = {
        id,
        tool,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        radius: 0,
        color,
        strokeWidth,
      };
    }
    
    setShapes([...shapes, newShape]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastShape = shapes[shapes.length - 1];

    if (lastShape.tool === 'pen' || lastShape.tool === 'eraser') {
      lastShape.points = lastShape.points!.concat([point.x, point.y]);
    } else if (lastShape.tool === 'rect') {
      lastShape.width = point.x - lastShape.x!;
      lastShape.height = point.y - lastShape.y!;
    } else if (lastShape.tool === 'circle') {
      const dx = point.x - lastShape.x!;
      const dy = point.y - lastShape.y!;
      lastShape.radius = Math.sqrt(dx * dx + dy * dy);
    }
    
    // Update local state
    shapes.splice(shapes.length - 1, 1, lastShape);
    setShapes(shapes.concat());
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    // Broadcast the final shape
    socket.emit('draw-line', { roomId, line: shapes[shapes.length - 1] }); 
    // Note: You might want to rename the socket event from 'draw-line' to 'draw-shape' on the server too for clarity, 
    // but 'draw-line' will work if you update the interface there or just pass 'any'.
  };

  return (
    <div className="border bg-white shadow-lg overflow-hidden">
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
      >
        <Layer>
          {shapes.map((shape, i) => {
            if (shape.tool === 'pen' || shape.tool === 'eraser') {
              return (
                <Line
                  key={i}
                  points={shape.points}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            } else if (shape.tool === 'rect') {
              return (
                <Rect
                  key={i}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                />
              );
            } else if (shape.tool === 'circle') {
              return (
                <Circle
                  key={i}
                  x={shape.x}
                  y={shape.y}
                  radius={shape.radius}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                />
              );
            }
          })}
        </Layer>
      </Stage>
    </div>
  );
}