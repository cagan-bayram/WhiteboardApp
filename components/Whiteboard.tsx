'use client';

import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Image as KonvaImage } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import useImage from 'use-image';
import { useStore, ShapeData } from '@/store/useStore';

let socket: Socket;



export default function Whiteboard({ roomId }: { roomId: string }) {
  // Use Global State instead of local useState
  const { tool, color, strokeWidth, shapes, addShape, updateShape, setShapes } = useStore();
  const isDrawing = useRef(false);

  // Sub-component to load images correctly
  const URLImage = ({ shape, onClick }: { shape: ShapeData; onClick?: () => void }) => {
    const [img] = useImage(shape.imageUrl || '');
    return (
      <KonvaImage
        image={img}
        x={shape.x}
        y={shape.y}
        width={shape.width || 200}
        height={shape.height || 200}
        onClick={onClick}
        onTap={onClick}
      />
    );
  };
  
  useEffect(() => {
    socket = io(); 
    socket.emit('join-room', roomId);

    // When server sends a shape, we add it to our store
    socket.on('draw-shape', (newShape: ShapeData) => {
      addShape(newShape);
    });
    
    socket.on('update-shape', ({ index, shape }: { index: number, shape: ShapeData }) => {
       // We need to handle updates (like bucket fill) from other users
       // Note: This requires a slight store refactor to update by ID rather than index for safety,
       // but for this MVP index matching is okay if synced perfectly.
       updateShape(index, shape); 
    });

    socket.on('clear-canvas', () => setShapes([]));

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      const text = e.clipboardData?.getData('text');
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              // Create the image shape centered on screen roughly
              const newShape: ShapeData = {
                id: crypto.randomUUID(),
                tool: 'image',
                x: window.innerWidth / 2 - 100,
                y: window.innerHeight / 2 - 100,
                width: 200,
                height: 200,
                color: 'transparent',
                strokeWidth: 0,
                imageUrl: base64
              };
              addShape(newShape);
              socket.emit('draw-shape', { roomId, shape: newShape });
            };
            reader.readAsDataURL(blob);
          }
        }
      }

      // 2. Handle YouTube Links (Text)
      if (text && text.includes('youtube.com/watch')) {
          const videoId = text.split('v=')[1]?.split('&')[0];
          if (videoId) {
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
            const newShape: ShapeData = {
              id: crypto.randomUUID(),
              tool: 'image',
              x: 200, y: 200, width: 320, height: 180,
              color: 'transparent', strokeWidth: 0,
              imageUrl: thumbnailUrl
            };
            addShape(newShape);
            socket.emit('draw-shape', { roomId, shape: newShape });
          }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => { 
      socket.disconnect();
      window.removeEventListener('paste', handlePaste);
    };
  }, [roomId, addShape, setShapes, updateShape]);

  const handleMouseDown = (e: any) => {
    // 1. Text Tool Logic
    if (tool === 'text') {
      const pos = e.target.getStage().getPointerPosition();
      const text = prompt("Enter text:"); // Simple MVP input
      if (text) {
        const newShape: ShapeData = {
          id: crypto.randomUUID(),
          tool: 'text',
          x: pos.x,
          y: pos.y,
          text: text,
          color: color,
          strokeWidth: 1, // Font size scalar or similar
        };
        addShape(newShape);
        socket.emit('draw-shape', { roomId, shape: newShape });
      }
      return;
    }

    // 2. Bucket Tool Logic (Handled in onClick of shapes, but we stop drawing here)
    if (tool === 'bucket') return;

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


  // 4. Handle Shape Clicks (For Bucket Fill)
  const handleShapeClick = (index: number) => {
    if (tool === 'bucket') {
      const shape = { ...shapes[index] };
      shape.fill = color; // Fill with current selected color
      updateShape(index, shape);
      // We need a new socket event for UPDATING a shape, not just adding
      socket.emit('update-shape', { roomId, index, shape }); 
    }
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
            if (shape.tool === 'image') return <URLImage key={i} shape={shape} onClick={() => handleShapeClick(i)} />;
            if (shape.tool === 'text') {
              return (
                <Text
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  draggable={tool == 'pen' ? false : false}
                  x={shape.x}
                  y={shape.y}
                  text={shape.text}
                  fontSize={24}
                  fill={shape.color} // Text color is 'fill' in Konva
                />
              );
            }
            
            if (shape.tool === 'rect') {
              return (
                <Rect 
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill}
                  draggable={tool == 'pen' ? false : false}
                  x={shape.x} 
                  y={shape.y} 
                  width={shape.width} 
                  height={shape.height}
                />
              );
            }

            if (shape.tool === 'circle') {
              return (
                <Circle
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill}
                  draggable={tool == 'pen' ? false : false}
                  x={shape.x} 
                  y={shape.y} 
                  radius={shape.radius}
                />  
              );
            
            } if (shape.tool === 'pen' || shape.tool === 'eraser') {
              return (
                <Line
                  key={i}
                  points={shape.points}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  // Lines don't usually have 'fill', but they catch clicks
                  onClick={() => handleShapeClick(i)} 
                />
              );
            }
          })}
        </Layer>
      </Stage>
    </div>
  );
}