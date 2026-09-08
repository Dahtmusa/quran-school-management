'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SignaturePadRef {
  getDataURL: () => string | null;
  isEmpty: () => boolean;
  clear: () => void;
}

interface Props {
  width?: number;
  height?: number;
  onSign?: () => void;
}

const SignaturePad = forwardRef<SignaturePadRef, Props>(({ width = 400, height = 160, onSign }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Transparent background — PNG exports keep alpha; CSS shows the container bg visually
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#062d2a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function getPos(clientX: number, clientY: number, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function startDraw(pos: { x: number; y: number }) {
    drawing.current = true;
    lastPos.current = pos;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(pos: { x: number; y: number }) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPos.current) return;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!signed) { setSigned(true); onSign?.(); }
  }

  function stopDraw() {
    drawing.current = false;
    lastPos.current = null;
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    startDraw(getPos(e.clientX, e.clientY, e.currentTarget));
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    draw(getPos(e.clientX, e.clientY, e.currentTarget));
  }
  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    startDraw(getPos(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget));
  }
  function onTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    draw(getPos(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
  }

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      if (!signed) return null;
      return canvasRef.current?.toDataURL('image/png') ?? null;
    },
    isEmpty: () => !signed,
    clear,
  }));

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white cursor-crosshair"
        style={{ maxWidth: width }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={stopDraw}
      />
      <button
        type="button"
        onClick={clear}
        className="self-start text-xs text-slate-400 hover:text-rose-500 transition-colors"
      >
        Clear
      </button>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;
