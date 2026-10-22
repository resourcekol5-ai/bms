import { BmsTelemetry, CellData } from '../types/battery';

export type ContactorState = 'open' | 'precharge' | 'closed' | 'tripped';

export interface EnergyCounters {
  whOut: number; // energy delivered to load (Wh)
  whIn: number; // energy accepted from charger (Wh)
  ahOut: number;
  ahIn: number;
  peakDischargeA: number;
  peakChargeA: number;
  peakPowerW: number;
}

export const EMPTY_ENERGY: EnergyCounters = {
  whOut: 0,
  whIn: 0,
  ahOut: 0,
  ahIn: 0,
  peakDischargeA: 0,
  peakChargeA: 0,
  peakPowerW: 0,
};

export interface ElectricalState {
  contactor: ContactorState;
  k1MainPos: boolean;
  k2MainNeg: boolean;
  k3Precharge: boolean;
  prechargePct: number;
  linkVoltage: number; // DC-link / load bus voltage (V)
  packVoltage: number;
  current: number; // + charge / − discharge (A)
  powerW: number;
  shuntMv: number; // voltage across 100 µΩ shunt
  shuntMicroOhm: number;
  packResistanceMohm: number; // string DCIR incl. busbars + harness
  busbarDropMv: number;
  ohmicLossW: number; // I²R inside the pack
  efficiencyPct: number;
  cRate: number;
  fuseRatingA: number;
  fuseLoadPct: number;
  fuseOk: boolean;
  isolationKohm: number;
  isolationLimitKohm: number; // 500 Ω/V (ISO 6469-3 / FMVSS 305 class)
  isolationOk: boolean;
  balancingChannels: number;
  balancingPowerW: number;
  prechargeResistorOhm: number;
  linkCapacitanceUf: number;
}

export const PRECHARGE_MS = 1400;
const HARNESS_MOHM = 2.2;
const BUSBAR_LINK_MOHM = 0.18;

export function computeElectrical(params: {
  telemetry: BmsTelemetry;
  cells: CellData[];
  seriesCount: number;
  parallelCount: number;
  isRunning: boolean;
  msSinceRunStart: number;
  tickCount: number;
}): ElectricalState {
  const { telemetry: t, cells, seriesCount, parallelCount, isRunning, msSinceRunStart, tickCount } = params;

  // String resistance: Σ (series-group IR / parallel) + busbar links + harness
  let stringMohm = 0;
  for (let s = 0; s < seriesCount; s++) {
    let sum = 0;
    let n = 0;
    for (let p = 0; p < parallelCount; p++) {
      const c = cells[s * parallelCount + p];
      if (c) {
        sum += c.internalResistance;
        n += 1;
      }
    }
    stringMohm += n ? sum / n / n : 0;
  }
  const busbarMohm = Math.max(0, seriesCount - 1) * BUSBAR_LINK_MOHM;
  const packResistanceMohm = stringMohm + busbarMohm + HARNESS_MOHM;

  // Contactor sequencing
  let contactor: ContactorState = 'open';
  if (!t.safetyRelayClosed) contactor = 'tripped';
  else if (isRunning && msSinceRunStart < PRECHARGE_MS) contactor = 'precharge';
  else if (isRunning) contactor = 'closed';

  const I = contactor === 'closed' ? t.packCurrent : 0;
  const prechargePct =
    contactor === 'closed' ? 100 : contactor === 'precharge' ? (1 - Math.exp(-msSinceRunStart / 280)) * 100 : 0;

  // DC-link: follows pack minus harness/busbar drop when closed, RC-charges during precharge
  const linkVoltage =
    contactor === 'closed'
      ? t.packVoltage + I * ((busbarMohm + HARNESS_MOHM) / 1000)
      : contactor === 'precharge'
      ? (t.packVoltage * prechargePct) / 100
      : 0;

  const shuntMicroOhm = 100;
  const shuntMv = I * shuntMicroOhm * 1e-3; // µΩ·A → mV
  const powerW = linkVoltage * I;
  const ohmicLossW = I * I * (packResistanceMohm / 1000);
  const delivered = Math.abs(powerW);
  const efficiencyPct = delivered > 0.5 ? (delivered / (delivered + ohmicLossW)) * 100 : 100;

  const capAh = t.packCapacityTotal || 1;
  const cRate = Math.abs(I) / capAh;

  const fuseRatingA = 80;
  const fuseLoadPct = (Math.abs(I) / fuseRatingA) * 100;

  // Insulation monitor (IMD): healthy ~2.4 MΩ, falls with temperature and with critical faults
  const thermalPenalty = Math.max(0, t.maxTemperature - 30) * 22;
  const critical = cells.some((c) => c.faultType === 'thermal_runaway' || c.faultType === 'dendrite_micro_short');
  const isolationKohm = critical
    ? 9 + 3 * Math.sin(tickCount / 7)
    : Math.max(40, 2400 - thermalPenalty + 35 * Math.sin(tickCount / 23) + 12 * Math.sin(tickCount / 5));
  const isolationLimitKohm = (Math.max(t.packVoltage, 1) * 500) / 1000;

  const balancing = cells.filter((c) => c.isBalancing);
  const balancingPowerW = balancing.reduce((s, c) => s + (Math.abs(c.balanceBleedCurrent) / 1000) * c.voltage, 0);

  return {
    contactor,
    k1MainPos: contactor === 'closed',
    k2MainNeg: contactor === 'closed' || contactor === 'precharge',
    k3Precharge: contactor === 'precharge',
    prechargePct,
    linkVoltage,
    packVoltage: t.packVoltage,
    current: I,
    powerW,
    shuntMv,
    shuntMicroOhm,
    packResistanceMohm,
    busbarDropMv: Math.abs(I) * (busbarMohm + HARNESS_MOHM),
    ohmicLossW,
    efficiencyPct,
    cRate,
    fuseRatingA,
    fuseLoadPct,
    fuseOk: Math.abs(I) < fuseRatingA,
    isolationKohm,
    isolationLimitKohm,
    isolationOk: isolationKohm > isolationLimitKohm,
    balancingChannels: balancing.length,
    balancingPowerW,
    prechargeResistorOhm: 47,
    linkCapacitanceUf: 1200,
  };
}

export function accumulateEnergy(e: EnergyCounters, current: number, voltage: number, dtSeconds: number): EnergyCounters {
  const dtH = dtSeconds / 3600;
  const p = current * voltage;
  return {
    whOut: e.whOut + (current < 0 ? -p * dtH : 0),
    whIn: e.whIn + (current > 0 ? p * dtH : 0),
    ahOut: e.ahOut + (current < 0 ? -current * dtH : 0),
    ahIn: e.ahIn + (current > 0 ? current * dtH : 0),
    peakDischargeA: Math.max(e.peakDischargeA, current < 0 ? -current : 0),
    peakChargeA: Math.max(e.peakChargeA, current > 0 ? current : 0),
    peakPowerW: Math.max(e.peakPowerW, Math.abs(p)),
  };
}

export function fmtPower(w: number): { value: string; unit: string } {
  const a = Math.abs(w);
  if (a >= 1000) return { value: (w / 1000).toFixed(2), unit: 'kW' };
  return { value: w.toFixed(0), unit: 'W' };
}

export function fmtOhm(kohm: number): string {
  if (kohm >= 1000) return `${(kohm / 1000).toFixed(2)} MΩ`;
  return `${kohm.toFixed(0)} kΩ`;
}
