import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CellData,
  ChemistrySpec,
  PackConfig,
  BmsTelemetry,
  SimulationMode,
  LoadProfile,
  SessionSnapshot,
} from '../types/battery';
import { BmsLogEvent } from '../components/BmsLogsModal';
import { packSeriesFromCells } from './chartData';
import { deliverFile } from './fileDelivery';
import type { ElectricalState, EnergyCounters } from './electrical';
import { estimateBatteryLife, estimateCellLife } from './batteryLife';
import { currentLimitA } from './alarmSystem';

export interface ReportContext {
  chemistrySpec: ChemistrySpec;
  config: PackConfig;
  cells: CellData[];
  telemetry: BmsTelemetry;
  logs: BmsLogEvent[];
  simulationMode: SimulationMode;
  loadProfile: LoadProfile;
  seriesCount: number;
  parallelCount: number;
  isRunning: boolean;
  elapsedMs: number;
  tickCount: number;
  sessionStartedAt: number | null;
  snapshots: SessionSnapshot[];
  electrical?: ElectricalState;
  energy?: EnergyCounters;
  alarmHistory?: import('./alarmSystem').AlarmRecord[];
}

export interface StoredReport {
  id: string;
  label: string;
  createdAt: string;
  session: {
    elapsedMs: number;
    tickCount: number;
    mode: SimulationMode;
    profile: LoadProfile;
    topology: string;
    chemistry: string;
  };
  ctx: ReportContext;
}

export function createStoredReport(ctx: ReportContext): StoredReport {
  const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const label = `${ctx.chemistrySpec.shortName} ${ctx.seriesCount}S${ctx.parallelCount}P`;
  return {
    id,
    label,
    createdAt: new Date().toISOString(),
    session: {
      elapsedMs: ctx.elapsedMs,
      tickCount: ctx.tickCount,
      mode: ctx.simulationMode,
      profile: ctx.loadProfile,
      topology: `${ctx.seriesCount}S${ctx.parallelCount}P`,
      chemistry: ctx.chemistrySpec.shortName,
    },
    ctx,
  };
}


export function downloadStoredReportPdf(report: StoredReport) {
  const name = downloadPackPdf(report.ctx);
  return name;
}

function cellRatings(ctx: ReportContext) {
  const s = ctx.chemistrySpec;
  return {
    cellType: s.name,
    nominalVoltage_V: s.nominalVoltage,
    maxVoltage_V: s.maxVoltage,
    cutoffVoltage_V: s.cutoffVoltage,
    capacity_mAh: s.typicalCapacity,
    internalResistance_mOhm: s.typicalIR,
    maxDischargeC: s.maxDischargeC,
    maxChargeC: s.maxChargeC,
    maxContinuousDischarge_A: Number(((s.typicalCapacity / 1000) * s.maxDischargeC).toFixed(1)),
    tempMin_C: s.tempMin,
    tempMax_C: s.tempMax,
  };
}

function electricalSection(ctx: ReportContext) {
  const e = ctx.electrical;
  const m = ctx.energy;
  return {
    contactors: e
      ? { state: e.contactor, K1_mainPositive: e.k1MainPos, K2_mainNegative: e.k2MainNeg, K3_precharge: e.k3Precharge, precharge_pct: Number(e.prechargePct.toFixed(1)) }
      : null,
    dcLinkVoltage_V: e ? Number(e.linkVoltage.toFixed(3)) : null,
    shuntCurrent_A: e ? Number(e.current.toFixed(3)) : null,
    shuntVoltage_mV: e ? Number(e.shuntMv.toFixed(3)) : null,
    busPower_W: e ? Number(e.powerW.toFixed(2)) : null,
    cRate: e ? Number(e.cRate.toFixed(3)) : null,
    packResistance_mOhm: e ? Number(e.packResistanceMohm.toFixed(2)) : null,
    ohmicLoss_W: e ? Number(e.ohmicLossW.toFixed(3)) : null,
    efficiency_pct: e ? Number(e.efficiencyPct.toFixed(2)) : null,
    fuse: e ? { rating_A: e.fuseRatingA, load_pct: Number(e.fuseLoadPct.toFixed(1)), ok: e.fuseOk } : null,
    insulation: e ? { resistance_kOhm: Number(e.isolationKohm.toFixed(1)), limit_kOhm: Number(e.isolationLimitKohm.toFixed(1)), ok: e.isolationOk } : null,
    balancing: e ? { activeChannels: e.balancingChannels, bleedPower_W: Number(e.balancingPowerW.toFixed(3)) } : null,
    metering: m
      ? {
          energyOut_Wh: Number(m.whOut.toFixed(3)),
          energyIn_Wh: Number(m.whIn.toFixed(3)),
          chargeOut_Ah: Number(m.ahOut.toFixed(4)),
          chargeIn_Ah: Number(m.ahIn.toFixed(4)),
          peakDischarge_A: Number(m.peakDischargeA.toFixed(2)),
          peakCharge_A: Number(m.peakChargeA.toFixed(2)),
          peakPower_W: Number(m.peakPowerW.toFixed(1)),
        }
      : null,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${pad2(m)}m ${pad2(s)}s`;
  return `${pad2(m)}:${pad2(s)}`;
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function slugChem(spec: ChemistrySpec): string {
  return spec.shortName.replace(/\s+/g, '');
}

function topology(ctx: ReportContext): string {
  return `${ctx.seriesCount}S${ctx.parallelCount}P`;
}

function savePdf(doc: jsPDF, filename: string) {
  deliverFile(doc.output('blob'), filename);
}

function modeLabel(mode: SimulationMode): string {
  return mode.replace(/_/g, ' ');
}

function healthScore(ctx: ReportContext): { score: number; grade: string; summary: string } {
  let score = 100;
  const t = ctx.telemetry;
  const spec = ctx.chemistrySpec;

  if (t.deltaVoltage > 80) score -= 25;
  else if (t.deltaVoltage > 50) score -= 15;
  else if (t.deltaVoltage > 25) score -= 6;

  if (t.maxTemperature >= spec.thermalRunawayTemp) score -= 40;
  else if (t.maxTemperature > spec.tempMax) score -= 20;
  else if (t.maxTemperature > spec.tempMax - 10) score -= 8;

  if (t.maxVoltage > spec.maxVoltage + 0.05) score -= 18;
  if (t.minVoltage < spec.cutoffVoltage - 0.05) score -= 18;
  if (t.faults.length > 0) score -= 12 * t.faults.length;
  if (!t.safetyRelayClosed) score -= 15;

  const avgSoh = ctx.cells.reduce((s, c) => s + c.soh, 0) / Math.max(1, ctx.cells.length);
  if (avgSoh < 85) score -= 10;

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? 'A (Excellent)' : score >= 75 ? 'B (Good)' : score >= 60 ? 'C (Fair)' : score >= 40 ? 'D (Degraded)' : 'F (Critical)';
  const summary =
    score >= 90
      ? 'Pack is healthy. Cell voltages are well matched and thermal envelope is nominal.'
      : score >= 75
      ? 'Pack is serviceable. Minor imbalance or thermal elevation should be monitored.'
      : score >= 60
      ? 'Pack requires attention. Run an equalization cycle and inspect hotspot cells.'
      : 'Pack is outside safe operating limits. Stop load, isolate faults, and do not charge until cleared.';

  return { score: Math.round(score), grade, summary };
}

function recommendations(ctx: ReportContext, cell?: CellData): string[] {
  const recs: string[] = [];
  const t = ctx.telemetry;
  const spec = ctx.chemistrySpec;

  if (t.deltaVoltage > 50) recs.push(`Cell delta is ${t.deltaVoltage.toFixed(1)} mV. Run active balancing until dV < 15 mV.`);
  if (t.maxTemperature > spec.tempMax) recs.push(`Peak cell temperature ${t.maxTemperature.toFixed(1)} C exceeds ${spec.tempMax} C limit. Enable cooling and reduce C-rate.`);
  if (t.maxVoltage > spec.maxVoltage) recs.push(`Over-voltage on cell #${t.maxVoltageCellId}. Stop charging and bleed/balance that cell.`);
  if (t.minVoltage < spec.cutoffVoltage) recs.push(`Under-voltage on cell #${t.minVoltageCellId}. Stop discharge immediately to prevent copper dissolution / polarity reversal.`);
  if (!t.safetyRelayClosed) recs.push('Main safety contactor is OPEN. Clear faults before re-closing the pack relay.');
  if (!ctx.config.activeCooling && t.maxTemperature > 40) recs.push('Active cooling is disabled while cells are warm. Enable the cooling fan.');

  const weak = ctx.cells.filter((c) => c.soh < 90);
  if (weak.length > 0) recs.push(`${weak.length} cell(s) report SoH below 90%. Schedule capacity test and consider replacement.`);

  if (cell) {
    const dMv = (cell.voltage - t.avgVoltage) * 1000;
    if (Math.abs(dMv) > 25) recs.push(`This cell is ${dMv >= 0 ? '+' : ''}${dMv.toFixed(1)} mV from pack mean.`);
    if (cell.internalResistance > spec.typicalIR * 1.8) recs.push(`Internal resistance ${cell.internalResistance.toFixed(1)} mOhm is elevated vs typical ${spec.typicalIR} mOhm (possible aging or dry-out).`);
    if (cell.faultType !== 'none') recs.push(`Active fault: ${cell.faultType.replace(/_/g, ' ')}. Isolate this cell from series string before reuse.`);
    if (cell.temperature > spec.tempMax - 5) recs.push('This cell is approaching the thermal limit. Reduce current or improve local heat sinking.');
  }

  if (recs.length === 0) recs.push('No corrective actions required. Continue scheduled monitoring.');
  return recs;
}

function physicsTimeSec(ctx: ReportContext): number {
  return Number(((ctx.tickCount * 0.2 * ctx.config.simulationSpeed)).toFixed(1));
}

export function buildPackReportObject(ctx: ReportContext) {
  const generatedAt = new Date().toISOString();
  const health = healthScore(ctx);
  const batteryLife = estimateBatteryLife(ctx.telemetry, ctx.cells, ctx.chemistrySpec);
  const avgSoh = Number((ctx.cells.reduce((s, c) => s + c.soh, 0) / Math.max(1, ctx.cells.length)).toFixed(1));

  return {
    reportType: 'pack' as const,
    documentTitle: 'e-BMS — Full Pack Electrical Report',
    software: {
      name: 'e-BMS',
      version: '2.1.0',
      module: 'Multi-Cell Battery Management Simulator',
    },
    generatedAt,
    generatedAtLocal: new Date().toLocaleString(),
    session: {
      running: ctx.isRunning,
      startedAt: ctx.sessionStartedAt ? new Date(ctx.sessionStartedAt).toISOString() : null,
      wallClockElapsed: formatDuration(ctx.elapsedMs),
      wallClockElapsedMs: ctx.elapsedMs,
      simulationTicks: ctx.tickCount,
      physicsTimeSec: physicsTimeSec(ctx),
      operatingMode: ctx.simulationMode,
      loadProfile: ctx.loadProfile,
    },
    packIdentity: {
      cellType: ctx.chemistrySpec.name,
      topology: topology(ctx),
      seriesCount: ctx.seriesCount,
      parallelCount: ctx.parallelCount,
      totalCells: ctx.cells.length,
      nominalPackVoltage: Number((ctx.chemistrySpec.nominalVoltage * ctx.seriesCount).toFixed(2)),
      maxPackVoltage: Number((ctx.chemistrySpec.maxVoltage * ctx.seriesCount).toFixed(2)),
      cutoffPackVoltage: Number((ctx.chemistrySpec.cutoffVoltage * ctx.seriesCount).toFixed(2)),
    },
    cellRatings: cellRatings(ctx),
    electrical: electricalSection(ctx),
    configuration: { ...ctx.config },
    healthAssessment: health,
    batteryLife: {
      runtime: batteryLife.runtimeText,
      runtimeSeconds: Math.round(batteryLife.runtimeSeconds),
      runtimeContext: batteryLife.runtimeContext,
      averageSoH_percent: Number(batteryLife.averageSoh.toFixed(1)),
      minimumSoH_percent: Number(batteryLife.minimumSoh.toFixed(1)),
      averageCycles: Number(batteryLife.averageCycles.toFixed(1)),
      estimatedRemainingCycles: batteryLife.remainingCycles,
      estimatedServiceYearsAtOneCyclePerDay: Number(batteryLife.estimatedServiceYears.toFixed(1)),
    },
    telemetry: { ...ctx.telemetry, packSoH: avgSoh },
    protection: {
      overVoltage: ctx.telemetry.maxVoltage > ctx.chemistrySpec.maxVoltage + 0.05 ? 'TRIPPED' : 'CLEAR',
      underVoltage: ctx.telemetry.minVoltage < ctx.chemistrySpec.cutoffVoltage - 0.05 ? 'TRIPPED' : 'CLEAR',
      overTemperature: ctx.telemetry.maxTemperature > ctx.chemistrySpec.tempMax ? 'TRIPPED' : 'CLEAR',
      overCurrent: Math.abs(ctx.telemetry.packCurrent) > currentLimitA(ctx.telemetry, ctx.chemistrySpec).limitA ? 'TRIPPED' : 'CLEAR',
      imbalance: ctx.telemetry.deltaVoltage > 60 ? 'IMBALANCED' : 'BALANCED',
      safetyRelay: ctx.telemetry.safetyRelayClosed ? 'CLOSED' : 'OPEN',
    },
    recommendations: recommendations(ctx),
    cells: ctx.cells.map((c) => serializeCell(c, ctx)),
    timeseries: ctx.snapshots,
    eventLog: ctx.logs,
  };
}

function serializeCell(c: CellData, ctx: ReportContext) {
  const avg = ctx.telemetry.avgVoltage;
  return {
    id: c.id,
    label: c.label,
    position: { row: c.row, col: c.col, parallelGroup: c.parallelGroup },
    voltage_V: c.voltage,
    deltaVsPackMean_mV: Number(((c.voltage - avg) * 1000).toFixed(2)),
    nominalVoltage_V: c.nominalVoltage,
    maxVoltage_V: c.maxVoltage,
    minVoltage_V: c.minVoltage,
    soc_percent: c.soc,
    soh_percent: c.soh,
    temperature_C: c.temperature,
    temperature_F: Number(((c.temperature * 9) / 5 + 32).toFixed(1)),
    internalResistance_mOhm: c.internalResistance,
    capacityNominal_mAh: c.capacityNominal,
    capacityRemaining_mAh: c.capacityRemaining,
    cycles: c.cycles,
    isBalancing: c.isBalancing,
    balanceBleedCurrent_mA: c.balanceBleedCurrent,
    status: c.status,
    faultType: c.faultType,
    history: c.history,
  };
}

export function buildCellReportObject(ctx: ReportContext, cellId: number) {
  const cell = ctx.cells.find((c) => c.id === cellId);
  if (!cell) throw new Error(`Cell #${cellId} not found`);
  const generatedAt = new Date().toISOString();
  const pack = buildPackReportObject(ctx);
  const life = estimateCellLife(cell, ctx.chemistrySpec);

  return {
    reportType: 'cell' as const,
    documentTitle: `e-BMS — Individual Cell Report (${cell.label})`,
    software: pack.software,
    generatedAt,
    generatedAtLocal: new Date().toLocaleString(),
    parentPack: {
      topology: topology(ctx),
      cellType: ctx.chemistrySpec.name,
      packVoltage_V: ctx.telemetry.packVoltage,
      packCurrent_A: ctx.telemetry.packCurrent,
      packSoC_percent: ctx.telemetry.packSoC,
      packMeanVoltage_V: ctx.telemetry.avgVoltage,
      packDelta_mV: ctx.telemetry.deltaVoltage,
    },
    session: pack.session,
    cell: serializeCell(cell, ctx),
    cellRatings: pack.cellRatings,
    electrical: pack.electrical,
    analysis: {
      voltageHeadroomToMax_V: Number((cell.maxVoltage - cell.voltage).toFixed(3)),
      voltageMarginToCutoff_V: Number((cell.voltage - cell.minVoltage).toFixed(3)),
      irVsTypical_ratio: Number((cell.internalResistance / Math.max(0.01, ctx.chemistrySpec.typicalIR)).toFixed(2)),
      thermalMargin_C: Number((ctx.chemistrySpec.tempMax - cell.temperature).toFixed(1)),
      batteryLife: {
        remainingCycles: life.remainingCycles,
        estimatedServiceYearsAtOneCyclePerDay: Number(life.estimatedServiceYears.toFixed(1)),
        capacityAtCurrentHealth_mAh: life.capacityAtHealthMah,
      },
      isHighestVoltage: cell.id === ctx.telemetry.maxVoltageCellId,
      isLowestVoltage: cell.id === ctx.telemetry.minVoltageCellId,
      isHottest: cell.id === ctx.telemetry.maxTempCellId,
    },
    recommendations: recommendations(ctx, cell),
    eventLog: ctx.logs.filter((l) => !l.cellId || l.cellId === cell.id),
  };
}



/* ===================== PDF DRAWING ===================== */

const NAVY: [number, number, number] = [15, 23, 42];
const BLUE: [number, number, number] = [37, 99, 235];
const SLATE: [number, number, number] = [71, 85, 105];
const GREEN: [number, number, number] = [5, 150, 105];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [217, 119, 6];

function addPageChrome(doc: jsPDF, title: string, subtitle: string, page: number, total: number) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 18, 'F');
  doc.setFillColor(...BLUE);
  doc.rect(0, 18, w, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('e-BMS  |  ELECTRICAL BATTERY MANAGEMENT REPORT', 14, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(title, 14, 14);
  doc.setFontSize(8);
  doc.text(`Page ${page} / ${total}`, w - 14, 8, { align: 'right' });
  doc.text(subtitle, w - 14, 14, { align: 'right' });
  doc.setFillColor(...NAVY);
  doc.rect(0, h - 10, w, 10, 'F');
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.text('Diagnostic use only  |  e-BMS Electrical Battery Management System', 14, h - 4);
  doc.text(new Date().toLocaleString(), w - 14, h - 4, { align: 'right' });
}

function drawKpi(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, sub: string, accent: [number, number, number]) {
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, 22, 1.5, 1.5, 'FD');
  doc.setFillColor(...accent);
  doc.rect(x, y, 1.4, 22, 'F');
  doc.setTextColor(...SLATE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(label, x + 5, y + 6);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(value, x + 5, y + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  doc.text(sub, x + 5, y + 18.5);
}

function drawSparkline(doc: jsPDF, x: number, y: number, w: number, h: number, values: number[], color: [number, number, number], label: string) {
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 1, 1, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(...SLATE);
  doc.setFont('helvetica', 'bold');
  doc.text(label, x + 3, y + 5);
  if (values.length < 2) {
    doc.setFont('helvetica', 'normal');
    doc.text('Insufficient samples', x + 3, y + h / 2);
    return;
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  let min = rawMin;
  let max = rawMax;
  if (max - min < 1e-6) {
    const pad = Math.max(0.05, Math.abs(max) * 0.02 || 0.05);
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.18;
    min -= pad;
    max += pad;
  }
  const range = max - min || 1;
  const left = x + 4;
  const right = x + w - 16;
  const top = y + 9;
  const bottom = y + h - 4;
  const plotH = bottom - top;
  const plotW = right - left;
  const yOf = (v: number) => bottom - ((v - min) / range) * plotH;
  const xOf = (i: number) => left + (i / (values.length - 1)) * plotW;
  doc.setDrawColor(241, 245, 249);
  doc.setLineWidth(0.15);
  for (let g = 0; g <= 3; g += 1) {
    const gy = top + (g / 3) * plotH;
    doc.line(left, gy, right, gy);
  }
  doc.setDrawColor(...color);
  doc.setLineWidth(0.7);
  for (let i = 1; i < values.length; i += 1) {
    doc.line(xOf(i - 1), yOf(values[i - 1]), xOf(i), yOf(values[i]));
  }
  const lastX = xOf(values.length - 1);
  const lastY = yOf(values[values.length - 1]);
  doc.setFillColor(...color);
  doc.circle(lastX, lastY, 0.7, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...SLATE);
  doc.text(`${rawMax.toFixed(3)}`, x + w - 2, top + 2, { align: 'right' });
  doc.text(`${rawMin.toFixed(3)}`, x + w - 2, bottom, { align: 'right' });
}

function finalizePages(doc: jsPDF, title: string, subtitle: string) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    addPageChrome(doc, title, subtitle, i, total);
  }
}

export function downloadPackPdf(ctx: ReportContext): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const spec = ctx.chemistrySpec;
  const t = ctx.telemetry;
  const life = estimateBatteryLife(ctx.telemetry, ctx.cells, spec);
  const title = `Pack Report — ${spec.shortName} ${topology(ctx)}`;

  let y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('FULL PACK ELECTRICAL REPORT', 14, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE);
  doc.text(`${spec.name} ${spec.nominalVoltage.toFixed(2)} V cell string  ·  ${topology(ctx)}  ·  ${(spec.nominalVoltage * ctx.seriesCount).toFixed(1)} V nominal  ·  Generated ${new Date().toLocaleString()}`, 14, y);
  y += 8;

  const kpiW = (w - 28 - 9) / 4;
  drawKpi(doc, 14, y, kpiW, 'PACK VOLTAGE', `${t.packVoltage.toFixed(2)} V`, `mean ${t.avgVoltage.toFixed(3)} V/cell`, GREEN);
  drawKpi(doc, 14 + (kpiW + 3), y, kpiW, 'SHUNT CURRENT', `${t.packCurrent.toFixed(2)} A`, `${Math.abs(t.packPower).toFixed(0)} W  ·  ${((t.packCurrent / Math.max(0.1, t.packCapacityTotal)) * 100).toFixed(1)}% capacity`, BLUE);
  drawKpi(doc, 14 + (kpiW + 3) * 2, y, kpiW, 'STATE OF CHARGE', `${t.packSoC.toFixed(1)} %`, `${t.packEnergyRemaining.toFixed(1)} Wh remaining`, [8, 145, 178]);
  drawKpi(doc, 14 + (kpiW + 3) * 3, y, kpiW, 'BATTERY RUNTIME', life.runtimeText, life.runtimeContext, AMBER);
  y += 28;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.4, textColor: NAVY, lineColor: [226, 232, 240] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [248, 250, 252] } },
    head: [['PACK IDENTITY', 'VALUE']],
    body: [
      ['Cell type', `${spec.name} (${spec.formFactorName.split('(')[0].trim()})`],
      ['Topology', `${topology(ctx)}  ·  ${ctx.cells.length} cells`],
      ['Operating mode', modeLabel(ctx.simulationMode)],
      ['Load profile', ctx.loadProfile.replace(/_/g, ' ')],
      ['Simulation state', ctx.isRunning ? 'RUNNING' : 'STOPPED'],
      ['Nominal / max / cutoff (pack)', `${(spec.nominalVoltage * ctx.seriesCount).toFixed(1)} / ${(spec.maxVoltage * ctx.seriesCount).toFixed(1)} / ${(spec.cutoffVoltage * ctx.seriesCount).toFixed(1)} V`],
      ['Ambient / cooling', `${ctx.config.ambientTemp} C  ·  fan ${ctx.config.activeCooling ? 'ON' : 'OFF'}`],
    ],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 6;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: NAVY, lineColor: [226, 232, 240] },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['LIVE TELEMETRY', 'VALUE', 'LIVE TELEMETRY', 'VALUE']],
    body: [
      ['Pack voltage', `${t.packVoltage.toFixed(3)} V`, 'Pack current', `${t.packCurrent.toFixed(2)} A`],
      ['Pack power', `${t.packPower.toFixed(1)} W`, 'State of charge', `${t.packSoC.toFixed(1)} %`],
      ['Energy remaining', `${t.packEnergyRemaining.toFixed(1)} Wh`, 'Capacity remaining', `${t.packCapacityRemaining.toFixed(2)} Ah`],
      ['Highest cell', `CH${t.maxVoltageCellId}  ${t.maxVoltage.toFixed(3)} V`, 'Lowest cell', `CH${t.minVoltageCellId}  ${t.minVoltage.toFixed(3)} V`],
      ['Cell delta', `${t.deltaVoltage.toFixed(1)} mV`, 'Mean cell voltage', `${t.avgVoltage.toFixed(3)} V`],
      ['Average temp', `${t.avgTemperature.toFixed(1)} C`, 'Peak temp', `CH${t.maxTempCellId}  ${t.maxTemperature.toFixed(1)} C`],
    ],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 6;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: NAVY, lineColor: [226, 232, 240] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['PROTECTION', 'LIMIT', 'STATE']],
    body: [
      ['OVP cell over-voltage', `${spec.maxVoltage.toFixed(2)} V`, t.maxVoltage > spec.maxVoltage + 0.05 ? 'TRIPPED' : 'CLEAR'],
      ['UVP cell under-voltage', `${spec.cutoffVoltage.toFixed(2)} V`, t.minVoltage < spec.cutoffVoltage - 0.05 ? 'TRIPPED' : 'CLEAR'],
      ['OTP thermal overload', `${spec.tempMax} C`, t.maxTemperature > spec.tempMax ? 'TRIPPED' : 'CLEAR'],
      ['OCP over-current', `${currentLimitA(t, spec).limitA.toFixed(0)} A rated`, Math.abs(t.packCurrent) > currentLimitA(t, spec).limitA ? 'TRIPPED' : 'CLEAR'],
      ['Imbalance', '60 mV', t.deltaVoltage > 60 ? 'IMBALANCED' : 'BALANCED'],
      ['Safety relay', t.safetyRelayClosed ? 'CLOSED' : 'OPEN', t.safetyRelayClosed ? 'OK' : 'LOCKOUT'],
    ],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const v = String(data.cell.raw);
        if (v === 'CLEAR' || v === 'BALANCED' || v === 'OK' || v === 'CLOSED') {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

  // ── Alarm & response log ──
  if (y > 190) {
    doc.addPage();
    y = 26;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('ALARM & RESPONSE LOG', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.3, textColor: NAVY, lineColor: [226, 232, 240] },
    headStyles: { fillColor: [153, 27, 27], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 5: { cellWidth: 46 } },
    head: [['Raised (UTC)', 'Threat', 'Severity', 'Cell', 'Measured / Limit', 'Response chosen', 'Outcome']],
    body:
      ctx.alarmHistory?.length
        ? ctx.alarmHistory.map((r) => [
            new Date(r.raisedAt).toLocaleTimeString(),
            r.title,
            r.severity === 'critical' ? 'CRITICAL' : 'WARNING',
            r.cellId ? `#${r.cellId}` : '—',
            `${r.measured} / ${r.limit}`,
            r.actionTaken ?? '—',
            r.outcome.toUpperCase(),
          ])
        : [['—', 'No alarms raised during this session', '—', '—', '—', '—', '—']],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const v = String(data.cell.raw);
        data.cell.styles.textColor = v === 'CRITICAL' ? RED : v === 'WARNING' ? AMBER : NAVY;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.addPage();
  y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('CELL-BY-CELL MATRIX', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 1.4, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    head: [['ID', 'Voltage', 'dV mV', 'SoC', 'SoH', 'Temp', 'IR', 'mAh', 'Bal', 'Status', 'Fault']],
    body: ctx.cells.map((c) => [
      String(c.id),
      `${c.voltage.toFixed(3)} V`,
      `${((c.voltage - t.avgVoltage) * 1000).toFixed(1)}`,
      `${c.soc.toFixed(1)}%`,
      `${c.soh}%`,
      `${c.temperature.toFixed(1)} C`,
      `${c.internalResistance.toFixed(1)}`,
      String(c.capacityRemaining),
      c.isBalancing ? 'YES' : 'no',
      c.status,
      c.faultType === 'none' ? '—' : c.faultType.replace(/_/g, ' '),
    ]),
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

  const derived = packSeriesFromCells(ctx.cells, ctx.seriesCount, ctx.parallelCount);
  const has = ctx.snapshots.length >= 2;
  const vSeries = has ? ctx.snapshots.map((s) => s.packVoltage) : derived.voltage;
  const socSeries = has ? ctx.snapshots.map((s) => s.packSoC) : derived.soc;
  const tempSeries = has ? ctx.snapshots.map((s) => s.maxTemp) : derived.temp;
  const dSeries = has ? ctx.snapshots.map((s) => s.deltaMv) : derived.deltaMv;

  if (y > 210) {
    doc.addPage();
    y = 26;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('SESSION WAVEFORMS', 14, y);
  y += 2;
  const chartW = (w - 28 - 4) / 2;
  drawSparkline(doc, 14, y, chartW, 38, vSeries, BLUE, 'Pack voltage (V)');
  drawSparkline(doc, 14 + chartW + 4, y, chartW, 38, socSeries, GREEN, 'Pack SoC (%)');
  y += 42;
  drawSparkline(doc, 14, y, chartW, 38, tempSeries, RED, 'Peak cell temperature (C)');
  drawSparkline(doc, 14 + chartW + 4, y, chartW, 38, dSeries, AMBER, 'Cell delta dV (mV)');
  y += 46;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('RECOMMENDED ACTIONS', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: NAVY },
    columnStyles: { 0: { cellWidth: 10, fontStyle: 'bold', textColor: BLUE } },
    body: recommendations(ctx).map((r, i) => [String(i + 1), r]),
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });

  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;
  if (y > 250) {
    doc.addPage();
    y = 26;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('ELECTRICAL SYSTEM & METERING', 14, y);
  y += 2;
  const es = electricalSection(ctx);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: NAVY, lineColor: [226, 232, 240] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [248, 250, 252] } },
    head: [['PARAMETER', 'VALUE']],
    body: [
      ['Contactor state', es.contactors ? `${es.contactors.state.toUpperCase()}  (K1 ${es.contactors.K1_mainPositive ? 'ON' : 'off'} / K2 ${es.contactors.K2_mainNegative ? 'ON' : 'off'} / K3 ${es.contactors.K3_precharge ? 'ON' : 'off'})` : 'n/a'],
      ['DC-link voltage', es.dcLinkVoltage_V !== null ? `${es.dcLinkVoltage_V} V` : 'n/a'],
      ['Shunt current / voltage', es.shuntCurrent_A !== null ? `${es.shuntCurrent_A} A  /  ${es.shuntVoltage_mV} mV (100 uOhm)` : 'n/a'],
      ['Bus power', es.busPower_W !== null ? `${es.busPower_W} W  ·  ${es.cRate} C` : 'n/a'],
      ['Pack resistance (DCIR)', es.packResistance_mOhm !== null ? `${es.packResistance_mOhm} mOhm` : 'n/a'],
      ['Internal I2R loss / efficiency', es.ohmicLoss_W !== null ? `${es.ohmicLoss_W} W  /  ${es.efficiency_pct} %` : 'n/a'],
      ['Fuse F1', es.fuse ? `${es.fuse.rating_A} A rated · ${es.fuse.load_pct}% load · ${es.fuse.ok ? 'OK' : 'BLOWN'}` : 'n/a'],
      ['Insulation resistance', es.insulation ? `${es.insulation.resistance_kOhm} kOhm (limit ${es.insulation.limit_kOhm} kOhm) · ${es.insulation.ok ? 'OK' : 'FAULT'}` : 'n/a'],
      ['Balancing', es.balancing ? `${es.balancing.activeChannels} channels · ${es.balancing.bleedPower_W} W` : 'n/a'],
      ['Energy out / in', es.metering ? `${es.metering.energyOut_Wh} / ${es.metering.energyIn_Wh} Wh` : 'n/a'],
      ['Charge out / in', es.metering ? `${es.metering.chargeOut_Ah} / ${es.metering.chargeIn_Ah} Ah` : 'n/a'],
      ['Peak discharge / charge / power', es.metering ? `${es.metering.peakDischarge_A} A / ${es.metering.peakCharge_A} A / ${es.metering.peakPower_W} W` : 'n/a'],
      ['Battery runtime', `${life.runtimeText} · ${life.runtimeContext}`],
      ['Service-life reserve', `${life.remainingCycles.toLocaleString()} cycles · approx. ${life.estimatedServiceYears.toFixed(1)} yr at 1 cycle/day`],
    ],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });

  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 6;
  autoTable(doc, {
    startY: y,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 1.4, textColor: NAVY },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['CELL RATING', 'VALUE']],
    body: [
      ['Cell type', cellRatings(ctx).cellType],
      ['Nominal / max / cutoff', `${cellRatings(ctx).nominalVoltage_V} / ${cellRatings(ctx).maxVoltage_V} / ${cellRatings(ctx).cutoffVoltage_V} V`],
      ['Capacity', `${cellRatings(ctx).capacity_mAh} mAh`],
      ['Internal resistance', `${cellRatings(ctx).internalResistance_mOhm} mOhm`],
      ['Max discharge / charge', `${cellRatings(ctx).maxDischargeC} C (${cellRatings(ctx).maxContinuousDischarge_A} A) / ${cellRatings(ctx).maxChargeC} C`],
      ['Operating temperature', `${cellRatings(ctx).tempMin_C} to ${cellRatings(ctx).tempMax_C} C`],
    ],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });

  doc.addPage();
  y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('BMS EVENT LOG', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 1.2, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['TIME', 'TYPE', 'CELL', 'MESSAGE']],
    body: ctx.logs.length === 0
      ? [['—', 'info', '—', 'No events recorded in this session.']]
      : ctx.logs.slice(0, 40).map((l) => [l.timestamp, l.type, l.cellId ? `#${l.cellId}` : '—', l.message]),
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
    columnStyles: { 3: { cellWidth: 90 } },
  });

  if (ctx.snapshots.length > 0) {
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;
    if (y > 230) {
      doc.addPage();
      y = 26;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text('SESSION TIMESERIES SAMPLES', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      theme: 'striped',
      styles: { fontSize: 6.5, cellPadding: 1.1, textColor: NAVY },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [['t (s)', 'Vpack', 'I (A)', 'P (W)', 'SoC %', 'dV mV', 'Tavg C', 'Tmax C']],
      body: ctx.snapshots.slice(-24).map((s) => [
        (s.elapsedMs / 1000).toFixed(1),
        s.packVoltage.toFixed(2),
        s.packCurrent.toFixed(2),
        s.packPower.toFixed(1),
        s.packSoC.toFixed(1),
        s.deltaMv.toFixed(1),
        s.avgTemp.toFixed(1),
        s.maxTemp.toFixed(1),
      ]),
      margin: { left: 14, right: 14, top: 22, bottom: 14 },
    });
  }

  finalizePages(doc, title, topology(ctx));
  const filename = `BMS_PackReport_${slugChem(spec)}_${topology(ctx)}_${stamp()}.pdf`;
  savePdf(doc, filename);
  return filename;
}

export function downloadCellPdf(ctx: ReportContext, cellId: number): string {
  const cell = ctx.cells.find((c) => c.id === cellId);
  if (!cell) return '';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const spec = ctx.chemistrySpec;
  const title = `Cell #${cell.id} — ${spec.shortName} ${topology(ctx)}`;
  const life = estimateCellLife(cell, spec);
  const dMv = (cell.voltage - ctx.telemetry.avgVoltage) * 1000;

  let y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text(`INDIVIDUAL CELL REPORT — ${cell.label}`, 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(`${spec.name} ${spec.nominalVoltage.toFixed(2)} V cell  |  Pack ${topology(ctx)}  |  Generated ${new Date().toLocaleString()}`, 14, y);
  y += 9;

  const kpiW = (doc.internal.pageSize.getWidth() - 28 - 9) / 4;
  drawKpi(doc, 14, y, kpiW, 'TERMINAL VOLTAGE', `${cell.voltage.toFixed(3)} V`, `dV ${dMv >= 0 ? '+' : ''}${dMv.toFixed(1)} mV vs mean`, BLUE);
  drawKpi(doc, 14 + (kpiW + 3), y, kpiW, 'STATE OF CHARGE', `${cell.soc.toFixed(1)} %`, `${cell.capacityRemaining} / ${cell.capacityNominal} mAh`, GREEN);
  drawKpi(doc, 14 + (kpiW + 3) * 2, y, kpiW, 'TEMPERATURE', `${cell.temperature.toFixed(1)} C`, `limit ${spec.tempMax} C`, AMBER);
  drawKpi(doc, 14 + (kpiW + 3) * 3, y, kpiW, 'INTERNAL R', `${cell.internalResistance.toFixed(1)} mOhm`, `factory ${spec.typicalIR} mOhm`, [124, 58, 237]);
  y += 28;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: NAVY, lineColor: [226, 232, 240] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [248, 250, 252] } },
    head: [['CELL PARAMETER', 'VALUE']],
    body: [
      ['Status / fault', `${cell.status} / ${cell.faultType}`],
      ['State of health', `${cell.soh}%  ·  ${cell.cycles} cycles completed`],
      ['Battery life remaining', `${life.remainingCycles.toLocaleString()} cycles  ·  approx. ${life.estimatedServiceYears.toFixed(1)} yr at 1 cycle/day`],
      ['Capacity at current health', `${life.capacityAtHealthMah} mAh`],
      ['Balancing', cell.isBalancing ? `ACTIVE  (${cell.balanceBleedCurrent} mA bleed)` : 'off'],
      ['Voltage window', `${spec.cutoffVoltage.toFixed(2)} V cutoff  -  ${spec.maxVoltage.toFixed(2)} V max`],
      ['Margin to OV', `${((cell.maxVoltage - cell.voltage) * 1000).toFixed(0)} mV`],
      ['Margin to UV', `${((cell.voltage - cell.minVoltage) * 1000).toFixed(0)} mV`],
      ['Thermal margin', `${(spec.tempMax - cell.temperature).toFixed(1)} C to rated limit`],
      ['IR vs factory', `${(cell.internalResistance / Math.max(0.01, spec.typicalIR)).toFixed(2)}x`],
      ['Stack position', `series ${cell.row + 1}  ·  parallel ${cell.parallelGroup + 1}`],
    ],
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

  const w4 = doc.internal.pageSize.getWidth();
  const chartW = (w4 - 28 - 4) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('CELL HISTORY (RECENT WINDOW)', 14, y);
  y += 2;
  drawSparkline(doc, 14, y, chartW, 36, cell.history.map((h) => h.voltage), BLUE, 'Voltage (V)');
  drawSparkline(doc, 14 + chartW + 4, y, chartW, 36, cell.history.map((h) => h.temperature), RED, 'Temperature (C)');
  y += 40;
  drawSparkline(doc, 14, y, chartW, 36, cell.history.map((h) => h.soc), GREEN, 'SoC (%)');
  drawSparkline(doc, 14 + chartW + 4, y, chartW, 36, cell.history.map((h) => h.current), AMBER, 'Current (A)');
  y += 44;

  autoTable(doc, {
    startY: y,
    theme: 'striped',
    styles: { fontSize: 6.5, cellPadding: 1.1, textColor: NAVY },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['t', 'Voltage V', 'Current A', 'Temp C', 'SoC %']],
    body: cell.history.slice(-16).map((h) => [
      new Date(h.time).toLocaleTimeString(),
      h.voltage.toFixed(3),
      h.current.toFixed(2),
      h.temperature.toFixed(1),
      h.soc.toFixed(1),
    ]),
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

  if (y > 240) {
    doc.addPage();
    y = 26;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('RECOMMENDED ACTIONS FOR THIS CELL', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: NAVY },
    columnStyles: { 0: { cellWidth: 10, fontStyle: 'bold', textColor: BLUE } },
    body: recommendations(ctx, cell).map((r, i) => [String(i + 1), r]),
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });

  const cellLogs = ctx.logs.filter((l) => !l.cellId || l.cellId === cell.id).slice(0, 20);
  if (cellLogs.length > 0) {
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 8;
    if (y > 240) {
      doc.addPage();
      y = 26;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('RELATED EVENT LOG', 14, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.2, textColor: NAVY },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [['TIME', 'TYPE', 'MESSAGE']],
      body: cellLogs.map((l) => [l.timestamp, l.type, l.message]),
      margin: { left: 14, right: 14, top: 22, bottom: 14 },
    });
  }

  finalizePages(doc, title, `Cell #${cell.id}`);
  const filename = `BMS_Cell${cell.id}_Report_${slugChem(spec)}_${topology(ctx)}_${stamp()}.pdf`;
  savePdf(doc, filename);
  return filename;
}

export function downloadAllCellsPdf(ctx: ReportContext): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const spec = ctx.chemistrySpec;
  const t = ctx.telemetry;
  const title = `All Cells — ${spec.shortName} ${topology(ctx)}`;

  let y = 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text('ALL-CELLS DIAGNOSTIC BOOKLET', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(`${ctx.cells.length} ${spec.name} ${spec.nominalVoltage.toFixed(2)} V cells  |  ${topology(ctx)}  |  Generated ${new Date().toLocaleString()}`, 14, y);
  y += 9;

  autoTable(doc, {
    startY: y,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 1.4, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['ID', 'Voltage', 'dV mV', 'SoC', 'Temp', 'IR', 'SoH', 'Status', 'Fault']],
    body: ctx.cells.map((c) => [
      String(c.id),
      `${c.voltage.toFixed(3)} V`,
      `${((c.voltage - t.avgVoltage) * 1000).toFixed(1)}`,
      `${c.soc.toFixed(1)}%`,
      `${c.temperature.toFixed(1)} C`,
      `${c.internalResistance.toFixed(1)}`,
      `${c.soh}%`,
      c.status,
      c.faultType === 'none' ? '—' : c.faultType.replace(/_/g, ' '),
    ]),
    margin: { left: 14, right: 14, top: 22, bottom: 14 },
  });

  ctx.cells.forEach((cell) => {
    doc.addPage();
    y = 26;
    const life = estimateCellLife(cell, spec);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(cell.label, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(`Status ${cell.status}  |  Fault ${cell.faultType}  |  Balancing ${cell.isBalancing ? 'ON' : 'off'}  |  SoH ${cell.soh}%  |  ${life.remainingCycles.toLocaleString()} cycles left`, 14, y);
    y += 8;

    const kpiW = (w - 28 - 9) / 4;
    drawKpi(doc, 14, y, kpiW, 'VOLTAGE', `${cell.voltage.toFixed(3)} V`, 'terminal', BLUE);
    drawKpi(doc, 14 + (kpiW + 3), y, kpiW, 'SoC', `${cell.soc.toFixed(1)} %`, `${cell.capacityRemaining} mAh`, GREEN);
    drawKpi(doc, 14 + (kpiW + 3) * 2, y, kpiW, 'TEMP', `${cell.temperature.toFixed(1)} C`, `limit ${spec.tempMax} C`, AMBER);
    drawKpi(doc, 14 + (kpiW + 3) * 3, y, kpiW, 'IR / SoH', `${cell.internalResistance.toFixed(1)} mOhm`, `${cell.soh}%`, [124, 58, 237]);
    y += 28;

    drawSparkline(doc, 14, y, w - 28, 40, cell.history.map((h) => h.voltage), BLUE, `Cell #${cell.id} voltage history (V)`);
    y += 48;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.4, textColor: NAVY },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50, fillColor: [248, 250, 252] } },
      head: [['PARAMETER', 'VALUE']],
      body: [
        ['Capacity remaining', `${cell.capacityRemaining} / ${cell.capacityNominal} mAh`],
        ['Cycles', String(cell.cycles)],
        ['Battery life remaining', `${life.remainingCycles.toLocaleString()} cycles · approx. ${life.estimatedServiceYears.toFixed(1)} yr at 1 cycle/day`],
        ['Margin to OV', `${((cell.maxVoltage - cell.voltage) * 1000).toFixed(0)} mV`],
        ['Margin to UV', `${((cell.voltage - cell.minVoltage) * 1000).toFixed(0)} mV`],
      ],
      margin: { left: 14, right: 14, top: 22, bottom: 14 },
    });

    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 6;
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.6, textColor: NAVY },
      columnStyles: { 0: { cellWidth: 10, fontStyle: 'bold', textColor: BLUE } },
      body: recommendations(ctx, cell).map((r, i) => [String(i + 1), r]),
      margin: { left: 14, right: 14, top: 22, bottom: 14 },
    });
  });

  finalizePages(doc, title, topology(ctx));
  const filename = `BMS_AllCells_PDF_${slugChem(spec)}_${topology(ctx)}_${stamp()}.pdf`;
  savePdf(doc, filename);
  return filename;
}
