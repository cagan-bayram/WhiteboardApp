'use client';

import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect, Circle } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import { useStore, ShapeData } from '@/store/useStore';

let socket: Socket;

export default function Whiteboard({ roomId }: { roomId: string }) {
  // Use Global State instead of local useState
  const { tool, color, strokeWidth, shapes, addShape, updateShape, setShapes } = useStore();
  const isDrawing = useRef(false);
  
  useEffect(() => {
    socket = io(); 
    socket.emit('join-room', roomId);

    // When server sends a shape, we add it to our store
    socket.on('draw-shape', (newShape: ShapeData) => {
      addShape(newShape);
    });

    socket.on('clear-canvas', () => setShapes([]));

    return () => { socket.disconnect(); };
  }, [roomId, addShape, setShapes]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const id = crypto.randomUUID();

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
    
    // Add to global store
    addShape(newShape);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    // Get the last shape from global store
    const lastShapeIndex = shapes.length - 1;
    const lastShape = { ...shapes[lastShapeIndex] }; // Create copy

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
    
    // Update global store
    updateShape(lastShapeIndex, lastShape);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    // Broadcast the final shape to other users
    socket.emit('draw-shape', { roomId, shape: shapes[shapes.length - 1] });
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