'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Image as KonvaImage, Transformer } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import useImage from 'use-image';
import { useStore, ShapeData } from '@/store/useStore';
import Konva from 'konva';

// Defined at module scope (not inside Whiteboard) so its component identity is
// stable across renders — otherwise every re-render remounts each image and
// reloads it via useImage, causing visible flicker while drawing.
const URLImage = ({
  shape,
  onClick,
  draggable,
  onDragEnd,
  onTransformEnd,
}: {
  shape: ShapeData;
  onClick?: () => void;
  draggable?: boolean;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
}) => {
  const [img] = useImage(shape.imageUrl || '', 'anonymous');
  return (
    <KonvaImage
      id={shape.id}
      onClick={onClick}
      onTap={onClick}
      image={img}
      x={shape.x}
      y={shape.y}
      width={shape.width || 200}
      height={shape.height || 200}
      rotation={shape.rotation || 0}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
};

// A live, playable YouTube embed rendered as an HTML overlay on top of the canvas
// (Konva's <canvas> can't host an <iframe>). Draggable by its header bar and
// resizable from the bottom-right corner; both sync via onLocalChange/onCommit.
const VIDEO_HEADER_H = 28;
const VideoEmbed = ({
  shape,
  onLocalChange,
  onCommit,
  onDelete,
}: {
  shape: ShapeData;
  onLocalChange: (s: ShapeData) => void;
  onCommit: (s: ShapeData) => void;
  onDelete: (id: string) => void;
}) => {
  const session = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; orig: ShapeData; latest: ShapeData } | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      const next: ShapeData = s.mode === 'move'
        ? { ...s.orig, x: (s.orig.x || 0) + dx, y: (s.orig.y || 0) + dy }
        : { ...s.orig, width: Math.max(200, (s.orig.width || 400) + dx), height: Math.max(112, (s.orig.height || 225) + dy) };
      s.latest = next;
      onLocalChange(next);
    };
    const handleUp = () => {
      const s = session.current;
      if (s) { onCommit(s.latest); session.current = null; }
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [onLocalChange, onCommit]);

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    session.current = { mode, startX: e.clientX, startY: e.clientY, orig: shape, latest: shape };
  };

  const w = shape.width || 400;
  const h = shape.height || 225;

  return (
    <div
      style={{
        position: 'absolute',
        top: shape.y || 0,
        left: shape.x || 0,
        width: w,
        zIndex: 5,
        borderRadius: 6,
        overflow: 'hidden',
        background: '#000',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      }}
    >
      <div
        onPointerDown={startDrag('move')}
        style={{
          height: VIDEO_HEADER_H,
          background: '#1f2937',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          cursor: 'move',
          fontSize: 12,
          userSelect: 'none',
        }}
      >
        <span>▶ YouTube</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(shape.id); }}
          title="Remove video"
          style={{ color: '#fca5a5', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <iframe
        src={`https://www.youtube.com/embed/${shape.videoId}`}
        width={w}
        height={h}
        style={{ border: 0, display: 'block' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        title={`youtube-${shape.videoId}`}
      />
      <div
        onPointerDown={startDrag('resize')}
        title="Drag to resize"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, #3b82f6 50%)',
        }}
      />
    </div>
  );
};

export default function Whiteboard({ roomId }: { roomId: string }) {
  const { tool, setTool, color, strokeWidth, shapes, addShape, prependShape, updateShape, updateShapeById, removeShapeById, setShapes, setBroadcastShape } = useStore();
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const socketRef = useRef<Socket | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  // Currently selected shape (only meaningful with the 'select' tool).
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Leaving the select tool clears any active selection.
  useEffect(() => {
    if (tool !== 'select') setSelectedId(null);
  }, [tool]);

  // Attach the Konva Transformer to the currently selected node.
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = tool === 'select' && selectedId ? stage.findOne('#' + selectedId) : null;
    tr.nodes(node ? [node as Konva.Node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, tool, shapes]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.emit('join-room', roomId);

    // Let other components (e.g. the toolbar's Add Video) broadcast new shapes.
    setBroadcastShape((shape: ShapeData) => socket.emit('draw-shape', { roomId, shape }));

    socket.on('draw-shape', (newShape: ShapeData) => {
      addShape(newShape);
    });

    socket.on('prepend-shape', (newShape: ShapeData) => {
      prependShape(newShape);
    });

    socket.on('update-shape', ({ id, shape }: { id: string; shape: ShapeData }) => {
      updateShapeById(id, shape);
    });

    socket.on('delete-shape', ({ id }: { id: string }) => {
      removeShapeById(id);
    });

    socket.on('clear-canvas', () => setShapes([]));

    const handlePaste = (e: ClipboardEvent) => {
      // Ignore pastes into form fields (e.g. the Add Video modal input, the text
      // editor, chat box) — otherwise pasting a link there would ALSO drop it on
      // the canvas, duplicating it.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }

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
                // Pasted images are one-shot inserts: drop to the cursor and
                // select the new image so it can be moved/resized right away.
                useStore.getState().setTool('select');
                setSelectedId(newShape.id);
              };
              reader.readAsDataURL(blob);
            }
          }
        }
      }

      if (text && (text.includes('youtube.com/watch') || text.includes('youtu.be/'))) {
        const videoId = text.split('v=')[1]?.split('&')[0] || text.split('youtu.be/')[1]?.split(/[?&]/)[0];
        if (videoId) {
          const newShape: ShapeData = {
            id: crypto.randomUUID(),
            tool: 'video',
            x: 200, y: 200, width: 400, height: 225,
            color: 'transparent', strokeWidth: 0,
            videoId,
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
      setBroadcastShape(null);
      window.removeEventListener('paste', handlePaste);
    };
  }, [roomId, addShape, prependShape, setShapes, updateShapeById, removeShapeById, setBroadcastShape]);

  // Stable handlers for the video overlays (drag = local update; commit = sync).
  const handleVideoChange = useCallback((s: ShapeData) => updateShapeById(s.id, s), [updateShapeById]);
  const handleVideoCommit = useCallback((s: ShapeData) => {
    updateShapeById(s.id, s);
    socketRef.current?.emit('update-shape', { roomId, id: s.id, shape: s });
  }, [updateShapeById, roomId]);
  const handleVideoDelete = useCallback((id: string) => {
    removeShapeById(id);
    socketRef.current?.emit('delete-shape', { roomId, id });
  }, [removeShapeById, roomId]);

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
    } else if (tool === 'select') {
      setSelectedId(shapes[index].id);
    }
  };

  // Commit a moved/resized node's geometry back into the store and sync it.
  const commitNode = (id: string, patch: Partial<ShapeData>) => {
    const shape = shapes.find((s) => s.id === id);
    if (!shape) return;
    const updated = { ...shape, ...patch };
    updateShapeById(id, updated);
    socketRef.current?.emit('update-shape', { roomId, id, shape: updated });
  };

  const handleDragEnd = (id: string) => (e: Konva.KonvaEventObject<DragEvent>) => {
    commitNode(id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = (id: string) => (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Bake the transform's scale back into real dimensions and reset the scale,
    // so the stored shape stays clean (scale always 1).
    node.scaleX(1);
    node.scaleY(1);
    const shape = shapes.find((s) => s.id === id);
    if (!shape) return;
    const patch: Partial<ShapeData> = { x: node.x(), y: node.y(), rotation: node.rotation() };
    if (shape.tool === 'rect' || shape.tool === 'image') {
      patch.width = Math.max(5, (shape.width || node.width()) * scaleX);
      patch.height = Math.max(5, (shape.height || node.height()) * scaleY);
    } else if (shape.tool === 'circle') {
      patch.radius = Math.max(5, (shape.radius || 0) * Math.max(scaleX, scaleY));
    } else if (shape.tool === 'text') {
      patch.strokeWidth = Math.max(6, (shape.strokeWidth || 24) * scaleY);
    } else if (shape.tool === 'pen' || shape.tool === 'eraser') {
      // Freehand strokes have no width/height — bake the scale into every point
      // coordinate (x on even indices, y on odd), and scale the line thickness by
      // the average factor so it reads like a proportionally resized drawing.
      const pts = shape.points || [];
      patch.points = pts.map((v, idx) => (idx % 2 === 0 ? v * scaleX : v * scaleY));
      patch.strokeWidth = Math.max(1, (shape.strokeWidth || 1) * ((scaleX + scaleY) / 2));
    }
    commitNode(id, patch);
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
      // Return to the cursor so the just-placed text can be moved/resized.
      setTool('select');
      setSelectedId(newShape.id);
    }
    setTextEditor(null);
    setTextValue('');
  };

  const cancelText = () => {
    setTextEditor(null);
    setTextValue('');
  };

  const handleMouseDown = async (e: any) => {
    if (tool === 'select') {
      // Click on empty canvas clears the selection; clicks on shapes are handled
      // by their own onClick (select) and Konva's built-in dragging.
      if (e.target === e.target.getStage()) setSelectedId(null);
      return;
    }

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
    // Miro-style: after placing a discrete shape, drop back to the cursor so it
    // can be moved/resized immediately. Pen/eraser stay active for repeat drawing.
    if (lastShape && (lastShape.tool === 'rect' || lastShape.tool === 'circle')) {
      setTool('select');
      setSelectedId(lastShape.id);
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
            // Videos are rendered as HTML overlays (below), not Konva nodes.
            if (shape.tool === 'video') return null;
            const selectable = tool === 'select';
            if (shape.tool === 'image') {
              return (
                <URLImage
                  key={shape.id}
                  shape={shape}
                  onClick={() => handleShapeClick(i)}
                  draggable={selectable}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            }
            if (shape.tool === 'text') {
              return (
                <Text
                  key={shape.id}
                  id={shape.id}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  text={shape.text}
                  fontSize={shape.strokeWidth || 24}
                  fill={shape.color}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            }
            if (shape.tool === 'pen' || shape.tool === 'eraser') {
              return (
                <Line
                  key={shape.id}
                  id={shape.id}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x || 0}
                  y={shape.y || 0}
                  points={shape.points}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  fill={shape.tool === 'eraser' ? undefined : shape.fill}
                  closed={!!shape.fill}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            } else if (shape.tool === 'rect') {
              return (
                <Rect
                  key={shape.id}
                  id={shape.id}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill || 'transparent'}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            } else if (shape.tool === 'circle') {
              return (
                <Circle
                  key={shape.id}
                  id={shape.id}
                  onClick={() => handleShapeClick(i)}
                  onTap={() => handleShapeClick(i)}
                  x={shape.x}
                  y={shape.y}
                  radius={shape.radius}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill || 'transparent'}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            }
          })}
          {tool === 'select' && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5 ? oldBox : newBox)}
            />
          )}
        </Layer>
      </Stage>

      {/* Live YouTube players — HTML overlays positioned over the canvas */}
      {shapes
        .filter((s) => s.tool === 'video')
        .map((s) => (
          <VideoEmbed
            key={s.id}
            shape={s}
            onLocalChange={handleVideoChange}
            onCommit={handleVideoCommit}
            onDelete={handleVideoDelete}
          />
        ))}
    </div>
  );
}
