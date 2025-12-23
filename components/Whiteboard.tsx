'use client';

import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Image as KonvaImage } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import useImage from 'use-image';
import { useStore, ShapeData } from '@/store/useStore';
import Konva from 'konva';

let socket: Socket;

export default function Whiteboard({ roomId }: { roomId: string }) {
  const { tool, color, strokeWidth, shapes, addShape, updateShape, setShapes } = useStore();
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const fillCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  // Sub-component to load images correctly
  const URLImage = ({ shape, onClick }: { shape: ShapeData, onClick?: () => void }) => {
    const [img] = useImage(shape.imageUrl || '');
    return (
      <KonvaImage
        onClick={onClick}
        onTap={onClick}
        image={img}
        x={shape.x}
        y={shape.y}
        width={shape.width || 200}
        height={shape.height || 200}
      />
    );
  };

  useEffect(() => {
    socket = io();
    socket.emit('join-room', roomId);

    socket.on('draw-shape', (newShape: ShapeData) => {
      addShape(newShape);
    });

    // NEW: Listen for shape updates (Bucket)
    socket.on('update-shape', ({ index, shape }: { index: number, shape: ShapeData }) => {
      updateShape(index, shape);
    });

    socket.on('clear-canvas', () => setShapes([]));

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      const text = e.clipboardData?.getData('text');

      // 1. Image Paste
      if (items) {
        for (const item of items) {
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const base64 = event.target?.result as string;
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
      }

      // 2. YouTube Links
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

  // HANDLE BUCKET FILL
  const handleShapeClick = (index: number) => {
    if (tool === 'bucket') {
      const shape = { ...shapes[index] };
      // If it's text, we change the font color. If it's a shape, we change the fill.
      if (shape.tool === 'text') {
        shape.color = color;
      } else {
        shape.fill = color;
      }

      updateShape(index, shape);
      socket.emit('update-shape', { roomId, index, shape });
    }
  };

  const hexToRgba = (hex: string): [number, number, number, number] => {
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return [r, g, b, 255];
  };

  const floodFill = (canvas: HTMLCanvasElement, sx: number, sy: number, fill: [number, number, number, number]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    const i = (sy * width + sx) * 4;
    const target = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (target.every((v, idx) => v === fill[idx])) return;

    const stack: Array<[number, number]> = [[sx, sy]];
    const match = (x: number, y: number) => {
      const k = (y * width + x) * 4;
      return data[k] === target[0] && data[k + 1] === target[1] && data[k + 2] === target[2] && data[k + 3] === target[3];
    };
    const paint = (x: number, y: number) => {
      const k = (y * width + x) * 4;
      data[k] = fill[0]; data[k + 1] = fill[1]; data[k + 2] = fill[2]; data[k + 3] = fill[3];
    };

    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height || !match(x, y)) continue;
      paint(x, y);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(img, 0, 0);
  };

  const handleBucketFill = async (pos: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage) return;
    const exportCanvas = stage.toCanvas({ pixelRatio: 1 });
    const off = fillCanvasRef.current;
    off.width = exportCanvas.width;
    off.height = exportCanvas.height;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(exportCanvas, 0, 0);
    floodFill(off, Math.round(pos.x), Math.round(pos.y), hexToRgba(color));
    const dataUrl = off.toDataURL();

    const newShape: ShapeData = {
      id: crypto.randomUUID(),
      tool: 'image',
      x: 0,
      y: 0,
      width: stage.width(),
      height: stage.height(),
      color: 'transparent',
      strokeWidth: 0,
      imageUrl: dataUrl,
    };
    addShape(newShape);
    socket.emit('draw-shape', { roomId, shape: newShape });
  };

  const handleMouseDown = async (e: any) => {
    // 1. Text Tool
    if (tool === 'text') {
      const pos = e.target.getStage().getPointerPosition();
      const text = prompt("Enter text:");
      if (text) {
        const newShape: ShapeData = {
          id: crypto.randomUUID(),
          tool: 'text',
          x: pos.x,
          y: pos.y,
          text: text,
          color: color,
          strokeWidth: 24, // Use strokeWidth as FontSize
        };
        addShape(newShape);
        socket.emit('draw-shape', { roomId, shape: newShape });
      }
      return;
    }

    // 2. Bucket Tool (Stop drawing)
    if (tool === 'bucket') {
      const pos = e.target.getStage().getPointerPosition();
      if (pos) await handleBucketFill(pos);
      return;
    }

    // 3. Drawing Logic
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
        fill: 'transparent'
      };
    }

    addShape(newShape);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastShapeIndex = shapes.length - 1;
    const lastShape = { ...shapes[lastShapeIndex] };

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

    updateShape(lastShapeIndex, lastShape);
  };

  const handleMouseUp = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      socket.emit('draw-shape', { roomId, shape: shapes[shapes.length - 1] });
    }
  };

  return (
    <div className="border bg-white shadow-lg overflow-hidden">
      <Stage
        ref={stageRef}
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
            if (shape.tool === 'image') {
              return <URLImage key={i} shape={shape} onClick={() => handleShapeClick(i)} />;
            }
            if (shape.tool === 'text') {
              return (
                <Text
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  text={shape.text}
                  fontSize={shape.strokeWidth || 24}
                  fill={shape.color} // For text, 'fill' is the font color
                  draggable={tool === 'pen' ? false : true} // Allow dragging text if not drawing
                />
              );
            }
            if (shape.tool === 'pen' || shape.tool === 'eraser') {
              return (
                <Line
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  points={shape.points}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  // THE MAGIC: Enable fill and closed for pencil lines
                  fill={shape.tool === 'eraser' ? undefined : shape.fill}
                  closed={!!shape.fill}
                />
              );
            } else if (shape.tool === 'rect') {
              return (
                <Rect
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill || 'transparent'}
                />
              );
            } else if (shape.tool === 'circle') {
              return (
                <Circle
                  key={i}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  radius={shape.radius}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill || 'transparent'}
                />
              );
            }
          })}
        </Layer>
      </Stage>
    </div>
  );
}