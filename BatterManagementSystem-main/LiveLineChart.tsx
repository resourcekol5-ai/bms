import { useEffect, useRef, useState } from 'react';
import { formatTick, niceRange } from '../../utils/chartData';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
  axis?: 'left' | 'right';
  fill?: boolean;
  dashed?: boolean;
  unit?: string;
  minSpan?: number;
  digits?: number;
}

interface LiveLineChartProps {
  series: ChartSeries[];
  height?: number;
  className?: string;
  emptyHint?: string;
  compact?: boolean;
}

function lastFinite(values: number[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

export function LiveLineChart({
  series,
  height = 210,
  className = '',
  emptyHint = 'Run simulation to capture a live waveform',
  compact = false,
}: LiveLineChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: height });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const apply = () => {
      const rect = el.getBoundingClientRect();
      const nextW = Math.max(1, Math.floor(rect.width));
      const nextH = Math.max(1, Math.floor(rect.height || height));
      setSize((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 8) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawChart(ctx, size.w, size.h, series, emptyHint, compact);
  }, [size, series, emptyHint, compact]);

  const leftSeries = series.filter((s) => (s.axis || 'left') === 'left');
  const rightSeries = series.filter((s) => s.axis === 'right');

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {series.map((s) => {
            const latest = lastFinite(s.values);
            return (
              <div key={s.id} className="flex items-center gap-1.5 text-[10px] font-mono">
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{
                    background: s.color,
                    boxShadow: `0 0 6px ${s.color}`,
                    borderBottom: s.dashed ? `1px dashed ${s.color}` : undefined,
                  }}
                />
                <span className="text-slate-400">{s.label}</span>
                <span className="font-bold" style={{ color: s.color }}>
                  {latest === null ? '—' : `${latest.toFixed(s.digits ?? 2)}${s.unit ? ` ${s.unit}` : ''}`}
                </span>
              </div>
            );
          })}
        </div>
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">Auto-scale</span>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-950"
        style={{ height }}
      >
        <canvas ref={canvasRef} className="block" />
      </div>

      {!compact && (leftSeries.length > 0 || rightSeries.length > 0) && (
        <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
          <span>{leftSeries[0] ? `L: ${leftSeries.map((s) => s.unit || s.label).join(' / ')}` : ''}</span>
          <span>oldest → now</span>
          <span>{rightSeries[0] ? `R: ${rightSeries.map((s) => s.unit || s.label).join(' / ')}` : ''}</span>
        </div>
      )}
    </div>
  );
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  series: ChartSeries[],
  emptyHint: string,
  compact = false
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  const hasRight = series.some((s) => s.axis === 'right');
  const pad = compact
    ? { l: 36, r: hasRight ? 36 : 8, t: 8, b: 8 }
    : { l: 46, r: hasRight ? 46 : 14, t: 12, b: 22 };
  const plotW = Math.max(1, width - pad.l - pad.r);
  const plotH = Math.max(1, height - pad.t - pad.b);
  const left = pad.l;
  const top = pad.t;
  const bottom = top + plotH;
  const right = left + plotW;

  const sampleCount = Math.max(0, ...series.map((s) => s.values.length));

  // Plot frame
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, plotW, plotH);

  if (sampleCount < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(emptyHint, left + plotW / 2, top + plotH / 2);
    return;
  }

  const rangeFor = (axis: 'left' | 'right') => {
    const items = series.filter((s) => (s.axis || 'left') === axis);
    const all: number[] = [];
    let minSpan = 0.01;
    items.forEach((s) => {
      s.values.forEach((v) => {
        if (Number.isFinite(v)) all.push(v);
      });
      if (s.minSpan && s.minSpan > minSpan) minSpan = s.minSpan;
    });
    if (!all.length) return { min: 0, max: 1, digits: 2 };
    const digits = items[0]?.digits ?? 2;
    const r = niceRange(Math.min(...all), Math.max(...all), minSpan);
    return { ...r, digits };
  };

  const leftRange = rangeFor('left');
  const rightRange = rangeFor('right');

  const yFor = (v: number, axis: 'left' | 'right') => {
    const r = axis === 'right' ? rightRange : leftRange;
    const t = (v - r.min) / (r.max - r.min || 1);
    return bottom - t * plotH;
  };

  const xFor = (i: number, n: number) => left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);

  // Horizontal grid + left ticks
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = top + (i / ticks) * plotH;
    ctx.strokeStyle = i === ticks || i === 0 ? '#1e293b' : '#132033';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    const lv = leftRange.max - (i / ticks) * (leftRange.max - leftRange.min);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatTick(lv, leftRange.digits), left - 6, y);

    if (hasRight) {
      const rv = rightRange.max - (i / ticks) * (rightRange.max - rightRange.min);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.fillText(formatTick(rv, rightRange.digits), right + 6, y);
    }
  }

  // Vertical grid
  for (let i = 0; i <= 6; i++) {
    const x = left + (i / 6) * plotW;
    ctx.strokeStyle = '#132033';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  if (!compact) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#64748b';
    ctx.fillText('start', left, bottom + 6);
    ctx.fillText('now', right, bottom + 6);
  }

  // Draw series (fill first, then line)
  series.forEach((s) => {
    const vals = s.values.filter((v) => Number.isFinite(v));
    if (vals.length === 1) {
      vals.push(vals[0]);
    }
    if (vals.length < 2) return;
    const axis = s.axis || 'left';
    const n = vals.length;

    if (s.fill) {
      const grad = ctx.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, hexToRgba(s.color, 0.28));
      grad.addColorStop(1, hexToRgba(s.color, 0.02));
      ctx.beginPath();
      ctx.moveTo(xFor(0, n), yFor(vals[0], axis));
      for (let i = 1; i < n; i++) ctx.lineTo(xFor(i, n), yFor(vals[i], axis));
      ctx.lineTo(xFor(n - 1, n), bottom);
      ctx.lineTo(xFor(0, n), bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = hexToRgba(s.color, 0.28);
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.moveTo(xFor(0, n), yFor(vals[0], axis));
    for (let i = 1; i < n; i++) ctx.lineTo(xFor(i, n), yFor(vals[i], axis));
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (s.dashed) ctx.setLineDash([5, 4]);
    ctx.moveTo(xFor(0, n), yFor(vals[0], axis));
    for (let i = 1; i < n; i++) ctx.lineTo(xFor(i, n), yFor(vals[i], axis));
    ctx.stroke();
    ctx.setLineDash([]);

    const lx = xFor(n - 1, n);
    const ly = yFor(vals[n - 1], axis);
    ctx.beginPath();
    ctx.fillStyle = s.color;
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
