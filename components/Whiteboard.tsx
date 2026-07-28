'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Image as KonvaImage } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import useImage from 'use-image';
import { useStore, ShapeData } from '@/store/useStore';
import Konva from 'konva';

// Defined at module scope (not inside Whiteboard) so its component identity is
// stable across renders — otherwise every re-render remounts each image and
// reloads it via useImage, causing visible flicker while drawing.
const URLImage = ({ shape, onClick }: { shape: ShapeData; onClick?: () => void }) => {
  const [img] = useImage(shape.imageUrl || '', 'anonymous');
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

export default function Whiteboard({ roomId }: { roomId: string }) {
  const { tool, color, strokeWidth, shapes, addShape, prependShape, updateShape, updateShapeById, setShapes } = useStore();
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const socketRef = useRef<Socket | null>(null);
  // Stable offscreen canvas reused for bucket fill — never recreated across renders
  const fillCanvas = useMemo(() => document.createElement('canvas'), []);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Inline text editing: when the text tool is used, we show a real <textarea>
  // at the click position instead of a blocking prompt().
  const [textEditor, setTextEditor] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the editor after it mounts (via a timeout so the click that opened it
  // has fully settled — autoFocus mid-click can immediately blur it shut).
  useEffect(() => {
    if (textEditor) {
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [textEditor]);

  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.emit('join-room', roomId);

    socket.on('draw-shape', (newShape: ShapeData) => {
      addShape(newShape);
    });

    socket.on('prepend-shape', (newShape: ShapeData) => {
      prependShape(newShape);
    });

    socket.on('update-shape', ({ id, shape }: { id: string; shape: ShapeData }) => {
      updateShapeById(id, shape);
    });

    socket.on('clear-canvas', () => setShapes([]));

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      const text = e.clipboardData?.getData('text');

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
                  imageUrl: base64,
                };
                addShape(newShape);
                socket.emit('draw-shape', { roomId, shape: newShape });
              };
              reader.readAsDataURL(blob);
            }
          }
        }
      }

      if (text && text.includes('youtube.com/watch')) {
        const videoId = text.split('v=')[1]?.split('&')[0];
        if (videoId) {
          const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
          const newShape: ShapeData = {
            id: crypto.randomUUID(),
            tool: 'image',
            x: 200, y: 200, width: 320, height: 180,
            color: 'transparent', strokeWidth: 0,
            imageUrl: thumbnailUrl,
          };
          addShape(newShape);
          socket.emit('draw-shape', { roomId, shape: newShape });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      socket.disconnect();
      socketRef.current = null;
      window.removeEventListener('paste', handlePaste);
    };
  }, [roomId, addShape, prependShape, setShapes, updateShapeById]);

  const handleShapeClick = (index: number) => {
    if (tool === 'bucket') {
      const shape = { ...shapes[index] };
      if (shape.tool === 'text') {
        shape.color = color;
      } else {
        shape.fill = color;
      }
      updateShape(index, shape);
      socketRef.current?.emit('update-shape', { roomId, id: shape.id, shape });
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
    fillCanvas.width = exportCanvas.width;
    fillCanvas.height = exportCanvas.height;
    const ctx = fillCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(exportCanvas, 0, 0);
    try {
      floodFill(fillCanvas, Math.round(pos.x), Math.round(pos.y), hexToRgba(color));
    } catch (e) {
      console.warn('Canvas tainted by cross-origin images; bucket fill unavailable.', e);
      return;
    }
    const dataUrl = fillCanvas.toDataURL();
    const newShape: ShapeData = {
      id: crypto.randomUUID(),
      tool: 'image',
      x: 0, y: 0,
      width: stage.width(), height: stage.height(),
      color: 'transparent', strokeWidth: 0,
      imageUrl: dataUrl,
    };
    // Append on top: the fill is a full snapshot of the current canvas, so the
    // newest fill must render above earlier ones (otherwise a second fill, e.g.
    // white over black, lands behind the first and is invisible). Strokes drawn
    // afterward are appended later and still render above the fill.
    addShape(newShape);
    socketRef.current?.emit('draw-shape', { roomId, shape: newShape });
  };

  const commitText = () => {
    if (textEditor && textValue.trim()) {
      const newShape: ShapeData = {
        id: crypto.randomUUID(),
        tool: 'text',
        x: textEditor.x,
        y: textEditor.y,
        text: textValue.trim(),
        color: color,
        strokeWidth: 24,
      };
      addShape(newShape);
      socketRef.current?.emit('draw-shape', { roomId, shape: newShape });
    }
    setTextEditor(null);
    setTextValue('');
  };

  const cancelText = () => {
    setTextEditor(null);
    setTextValue('');
  };

  const handleMouseDown = async (e: any) => {
    if (tool === 'text') {
      // If an editor is already open, its onBlur will commit it — don't open
      // another on the same click.
      if (textEditor) return;
      const pos = e.target.getStage().getPointerPosition();
      if (pos) setTextEditor({ x: pos.x, y: pos.y });
      return;
    }

    if (tool === 'bucket') {
      const pos = e.target.getStage().getPointerPosition();
      if (pos) await handleBucketFill(pos);
      return;
    }

    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const id = crypto.randomUUID();
    let newShape: ShapeData;

    if (tool === 'pen' || tool === 'eraser') {
      newShape = {
        id, tool,
        points: [pos.x, pos.y],
        color: tool === 'eraser' ? '#ffffff' : color,
        strokeWidth: tool === 'eraser' ? 20 : strokeWidth,
      };
    } else {
      newShape = {
        id, tool,
        x: pos.x, y: pos.y,
        width: 0, height: 0, radius: 0,
        color, strokeWidth,
        fill: 'transparent',
      };
    }
    addShape(newShape);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastShapeIndex = shapes.length - 1;
    if (lastShapeIndex < 0) return;
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
    if (!isDrawing.current) return;
    isDrawing.current = false;
    // Read from store directly to avoid stale closure
    const currentShapes = useStore.getState().shapes;
    const lastShape = currentShapes[currentShapes.length - 1];
    if (lastShape) {
      socketRef.current?.emit('draw-shape', { roomId, shape: lastShape });
    }
  };

  return (
    <div className="relative border bg-white shadow-lg overflow-hidden">
      {textEditor && (
        <textarea
          ref={textareaRef}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelText();
            }
          }}
          placeholder="Type text, Enter to add"
          rows={1}
          style={{
            position: 'absolute',
            top: textEditor.y,
            left: textEditor.x,
            zIndex: 30,
            color: color,
            fontSize: 24,
            lineHeight: 1.2,
            background: '#ffffff',
            border: '2px solid #3b82f6',
            borderRadius: 4,
            outline: 'none',
            padding: '2px 6px',
            margin: 0,
            resize: 'none',
            overflow: 'hidden',
            minWidth: 160,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        />
      )}
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
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
              return <URLImage key={shape.id} shape={shape} onClick={() => handleShapeClick(i)} />;
            }
            if (shape.tool === 'text') {
              return (
                <Text
                  key={shape.id}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  text={shape.text}
                  fontSize={shape.strokeWidth || 24}
                  fill={shape.color}
                  draggable={tool !== 'pen'}
                />
              );
            }
            if (shape.tool === 'pen' || shape.tool === 'eraser') {
              return (
                <Line
                  key={shape.id}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  points={shape.points}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  fill={shape.tool === 'eraser' ? undefined : shape.fill}
                  closed={!!shape.fill}
                />
              );
            } else if (shape.tool === 'rect') {
              return (
                <Rect
                  key={shape.id}
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
                  key={shape.id}
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
