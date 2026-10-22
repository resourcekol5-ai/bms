import { CellData } from '../types/battery';

export const CELL_HISTORY_LIMIT = 180;

export function niceRange(min: number, max: number, minSpan = 0.01): { min: number; max: number } {
  const finiteMin = Number.isFinite(min) ? min : 0;
  const finiteMax = Number.isFinite(max) ? max : minSpan;
  let lo = Math.min(finiteMin, finiteMax);
  let hi = Math.max(finiteMin, finiteMax);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  } else {
    const pad = (hi - lo) * 0.14;
    lo -= pad;
    hi += pad;
  }
  if (lo === hi) {
    lo -= minSpan / 2;
    hi += minSpan / 2;
  }
  return { min: lo, max: hi };
}

export function packSeriesFromCells(
  cells: CellData[],
  seriesCount: number,
  parallelCount: number
): { voltage: number[]; current: number[]; soc: number[]; temp: number[]; deltaMv: number[]; times: number[] } {
  const empty = { voltage: [] as number[], current: [] as number[], soc: [] as number[], temp: [] as number[], deltaMv: [] as number[], times: [] as number[] };
  if (!cells.length) return empty;

  const len = Math.min(...cells.map((c) => c.history.length));
  if (len < 1) return empty;

  const voltage: number[] = [];
  const current: number[] = [];
  const soc: number[] = [];
  const temp: number[] = [];
  const deltaMv: number[] = [];
  const times: number[] = [];

  for (let i = 0; i < len; i++) {
    let seriesSum = 0;
    let socSum = 0;
    let tempSum = 0;
    let currentSum = 0;
    let minV = Infinity;
    let maxV = -Infinity;

    for (let s = 0; s < seriesCount; s++) {
      let parallelSum = 0;
      let parallelCountActual = 0;
      for (let p = 0; p < parallelCount; p++) {
        const cell = cells[s * parallelCount + p];
        if (!cell) continue;
        const h = cell.history[i];
        const v = h?.voltage ?? cell.voltage;
        parallelSum += v;
        parallelCountActual += 1;
        currentSum += h?.current ?? 0;
        socSum += h?.soc ?? cell.soc;
        tempSum += h?.temperature ?? cell.temperature;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      seriesSum += parallelSum / Math.max(1, parallelCountActual);
    }

    voltage.push(Number(seriesSum.toFixed(4)));
    current.push(Number(((currentSum / Math.max(1, cells.length)) * parallelCount).toFixed(3)));
    soc.push(Number((socSum / cells.length).toFixed(2)));
    temp.push(Number((tempSum / cells.length).toFixed(2)));
    deltaMv.push(Number(((maxV - minV) * 1000).toFixed(2)));
    times.push(cells[0].history[i]?.time ?? i);
  }

  return { voltage, current, soc, temp, deltaMv, times };
}

export function formatTick(v: number, digits: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(Math.min(1, digits));
  return v.toFixed(digits);
}
