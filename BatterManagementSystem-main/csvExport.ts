// Excel-ready CSV report exports (UTF-8 BOM so Excel renders °, Ω, Δ correctly).
import { ReportContext } from './reportGenerator';
import { deliverText } from './fileDelivery';
import { estimateBatteryLife, estimateCellLife } from './batteryLife';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function slug(ctx: ReportContext): string {
  return ctx.chemistrySpec.shortName.replace(/\s+/g, '');
}

function topo(ctx: ReportContext): string {
  return `${ctx.seriesCount}S${ctx.parallelCount}P`;
}

function esc(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(lines: string[][]): string {
  return `${'\uFEFF'}${lines.map((line) => line.map(esc).join(',')).join('\r\n')}`;
}

function cellRow(ctx: ReportContext, c: (typeof ctx.cells)[number], meanV: number): string[] {
  const spec = ctx.chemistrySpec;
  return [
    String(c.id),
    c.label,
    String(c.row),
    String(c.parallelGroup),
    c.voltage.toFixed(4),
    ((c.voltage - meanV) * 1000).toFixed(2),
    c.soc.toFixed(2),
    c.soh.toFixed(1),
    c.temperature.toFixed(1),
    c.internalResistance.toFixed(2),
    String(c.capacityNominal),
    String(c.capacityRemaining),
    String(c.cycles),
    String(Math.max(0, spec.cycleLife - c.cycles)),
    c.isBalancing ? 'YES' : 'no',
    String(c.balanceBleedCurrent),
    c.status,
    c.faultType,
  ];
}

const CELL_HEADERS = [
  'id',
  'label',
  'series_position',
  'parallel_group',
  'voltage_V',
  'delta_vs_mean_mV',
  'soc_percent',
  'soh_percent',
  'temperature_C',
  'internal_resistance_mOhm',
  'capacity_nominal_mAh',
  'capacity_remaining_mAh',
  'cycles_completed',
  'cycles_remaining',
  'balancing',
  'balance_bleed_mA',
  'status',
  'fault_type',
];

export function downloadPackCsv(ctx: ReportContext): string {
  const t = ctx.telemetry;
  const spec = ctx.chemistrySpec;
  const life = estimateBatteryLife(t, ctx.cells, spec);
  const meanV = ctx.cells.reduce((s, c) => s + c.voltage, 0) / Math.max(1, ctx.cells.length);

  const lines: string[][] = [
    ['BMS Pack Report'],
    ['Generated (UTC)', new Date().toISOString()],
    ['Topology', topo(ctx)],
    ['Cell type', spec.name],
    ['Simulation state', ctx.isRunning ? 'RUNNING' : 'STOPPED'],
    ...(ctx.alarmHistory?.length
      ? [
          [],
          ['ALARM & RESPONSE LOG'],
          ['Raised (UTC)', 'Threat', 'Severity', 'Cell', 'Measured', 'Limit', 'Response chosen', 'Outcome', 'Resolved (UTC)'],
          ...ctx.alarmHistory.map((r) => [
            new Date(r.raisedAt).toISOString(),
            r.title,
            r.severity.toUpperCase(),
            r.cellId ? `#${r.cellId}` : '—',
            r.measured,
            r.limit,
            r.actionTaken ?? '—',
            r.outcome.toUpperCase(),
            r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '—',
          ]),
        ]
      : []),
    [],
    ['PACK SUMMARY', 'value'],
    ['Pack voltage (V)', t.packVoltage.toFixed(3)],
    ['Pack current (A)', t.packCurrent.toFixed(2)],
    ['Pack power (W)', t.packPower.toFixed(1)],
    ['State of charge (%)', t.packSoC.toFixed(2)],
    ['Remaining capacity (Ah)', t.packCapacityRemaining.toFixed(3)],
    ['Total capacity (Ah)', t.packCapacityTotal.toFixed(3)],
    ['Remaining energy (Wh)', t.packEnergyRemaining.toFixed(1)],
    ['Highest cell (V)', `${t.maxVoltage.toFixed(3)} (CH${t.maxVoltageCellId})`],
    ['Lowest cell (V)', `${t.minVoltage.toFixed(3)} (CH${t.minVoltageCellId})`],
    ['Mean cell voltage (V)', t.avgVoltage.toFixed(3)],
    ['Cell delta (mV)', t.deltaVoltage.toFixed(1)],
    ['Peak temperature (C)', `${t.maxTemperature.toFixed(1)} (CH${t.maxTempCellId})`],
    ['Average temperature (C)', t.avgTemperature.toFixed(1)],
    ['Protection relay', t.safetyRelayClosed ? 'CLOSED' : 'TRIPPED'],
    ['Warnings', t.warnings.join(' | ') || 'none'],
    ['Faults', t.faults.join(' | ') || 'none'],
    ['Battery runtime', `${life.runtimeText} (${life.runtimeContext})`],
    ['Average SoH (%)', life.averageSoh.toFixed(1)],
    ['Minimum SoH (%)', life.minimumSoh.toFixed(1)],
    ['Remaining cycles', String(life.remainingCycles)],
    ['Service life at 1 cycle/day (years)', life.estimatedServiceYears.toFixed(1)],
    [],
    ['CELL DATA'],
    CELL_HEADERS,
    ...ctx.cells.map((c) => cellRow(ctx, c, meanV)),
  ];

  const filename = `BMS_PackReport_${slug(ctx)}_${topo(ctx)}_${stamp()}.csv`;
  deliverText(toCsv(lines), filename, 'text/csv');
  return filename;
}

export function downloadCellsCsv(ctx: ReportContext): string {
  const meanV = ctx.cells.reduce((s, c) => s + c.voltage, 0) / Math.max(1, ctx.cells.length);
  const lines: string[][] = [
    ['Generated (UTC)', new Date().toISOString()],
    ['Topology', topo(ctx)],
    ['Cell type', ctx.chemistrySpec.name],
    [],
    CELL_HEADERS,
    ...ctx.cells.map((c) => cellRow(ctx, c, meanV)),
  ];
  const filename = `BMS_AllCells_${slug(ctx)}_${topo(ctx)}_${stamp()}.csv`;
  deliverText(toCsv(lines), filename, 'text/csv');
  return filename;
}

export function downloadCellCsv(ctx: ReportContext, cellId: number): string {
  const cell = ctx.cells.find((c) => c.id === cellId);
  if (!cell) throw new Error(`Cell #${cellId} not found`);
  const spec = ctx.chemistrySpec;
  const life = estimateCellLife(cell, spec);
  const meanV = ctx.cells.reduce((s, c) => s + c.voltage, 0) / Math.max(1, ctx.cells.length);

  const lines: string[][] = [
    ['BMS Cell Report', cell.label],
    ['Generated (UTC)', new Date().toISOString()],
    ['Pack', `${topo(ctx)} · ${spec.name}`],
    [],
    ['METRICS', 'value'],
    ['Terminal voltage (V)', cell.voltage.toFixed(4)],
    ['Delta vs pack mean (mV)', ((cell.voltage - meanV) * 1000).toFixed(2)],
    ['Voltage window (V)', `${spec.cutoffVoltage} - ${spec.maxVoltage}`],
    ['State of charge (%)', cell.soc.toFixed(2)],
    ['State of health (%)', cell.soh.toFixed(1)],
    ['Temperature (C)', cell.temperature.toFixed(1)],
    ['Internal resistance (mOhm)', cell.internalResistance.toFixed(2)],
    ['Factory resistance (mOhm)', String(spec.typicalIR)],
    ['Capacity nominal (mAh)', String(cell.capacityNominal)],
    ['Capacity remaining (mAh)', String(cell.capacityRemaining)],
    ['Cycles completed', String(cell.cycles)],
    ['Battery life remaining (cycles)', String(life.remainingCycles)],
    ['Service life at 1 cycle/day (years)', life.estimatedServiceYears.toFixed(1)],
    ['Balancing', cell.isBalancing ? `YES (${cell.balanceBleedCurrent} mA)` : 'no'],
    ['Status', cell.status],
    ['Fault type', cell.faultType],
    [],
    ['HISTORY (oldest to newest)'],
    ['time (UTC)', 'voltage_V', 'current_A', 'temperature_C', 'soc_percent'],
    ...cell.history.map((h) => [new Date(h.time).toISOString(), h.voltage.toFixed(4), h.current.toFixed(3), h.temperature.toFixed(2), h.soc.toFixed(2)]),
  ];

  const filename = `BMS_Cell${cellId}_${slug(ctx)}_${topo(ctx)}_${stamp()}.csv`;
  deliverText(toCsv(lines), filename, 'text/csv');
  return filename;
}
