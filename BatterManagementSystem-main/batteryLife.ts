import { BmsTelemetry, CellData, ChemistrySpec } from '../types/battery';

export interface BatteryLifeEstimate {
  runtimeSeconds: number;
  runtimeText: string;
  runtimeContext: string;
  averageSoh: number;
  minimumSoh: number;
  averageCycles: number;
  remainingCycles: number;
  estimatedServiceYears: number;
}

export function formatBatteryTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 48) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return hrs ? `${days}d ${hrs}h` : `${days}d`;
}

export function estimateBatteryLife(
  telemetry: BmsTelemetry,
  cells: CellData[],
  spec: ChemistrySpec,
): BatteryLifeEstimate {
  const count = Math.max(1, cells.length);
  const averageSoh = cells.reduce((sum, cell) => sum + cell.soh, 0) / count;
  const minimumSoh = cells.length ? Math.min(...cells.map((cell) => cell.soh)) : 100;
  const averageCycles = cells.reduce((sum, cell) => sum + cell.cycles, 0) / count;
  const remainingCycles = Math.max(0, Math.round(spec.cycleLife - averageCycles));
  // One equivalent full cycle per day is a useful service-life comparison, not a warranty prediction.
  const estimatedServiceYears = remainingCycles / 365;

  const current = telemetry.packCurrent;
  let runtimeSeconds = 0;
  let runtimeContext = 'standby estimate';

  if (current < -0.05) {
    runtimeSeconds = (telemetry.packCapacityRemaining / Math.abs(current)) * 3600;
    runtimeContext = `to cutoff @ ${Math.abs(current).toFixed(1)} A`;
  } else if (current > 0.05) {
    const capacityNeeded = Math.max(0, telemetry.packCapacityTotal - telemetry.packCapacityRemaining);
    runtimeSeconds = (capacityNeeded / current) * 3600;
    runtimeContext = `to full @ ${current.toFixed(1)} A`;
  } else {
    // BMS + contactor-controller standby draw used by the electrical model.
    const standbyCurrent = 0.04;
    runtimeSeconds = (telemetry.packCapacityRemaining / standbyCurrent) * 3600;
  }

  return {
    runtimeSeconds,
    runtimeText: formatBatteryTime(runtimeSeconds),
    runtimeContext,
    averageSoh,
    minimumSoh,
    averageCycles,
    remainingCycles,
    estimatedServiceYears,
  };
}

export function estimateCellLife(cell: CellData, spec: ChemistrySpec) {
  const remainingCycles = Math.max(0, Math.round(spec.cycleLife - cell.cycles));
  return {
    remainingCycles,
    estimatedServiceYears: remainingCycles / 365,
    capacityAtHealthMah: Math.round(cell.capacityNominal * (cell.soh / 100)),
  };
}