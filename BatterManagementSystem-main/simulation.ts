import { BatteryChemistryType, CellData, ChemistrySpec, SimulationMode, PackConfig, CellStatus, CellFaultType } from '../types/battery';
import { BATTERY_CHEMISTRIES } from '../data/batteryChemistryData';
import { CELL_HISTORY_LIMIT } from './chartData';

// Generate Open Circuit Voltage (OCV) based on SoC and Chemistry
export function calculateOcvFromSoc(soc: number, chemistry: BatteryChemistryType): number {
  const spec = BATTERY_CHEMISTRIES[chemistry];
  const s = Math.max(0, Math.min(100, soc)) / 100; // 0 to 1

  switch (chemistry) {
    case 'li-ion':
      // NMC typical S-curve: 2.8V at 0%, 3.7V around 50%, 4.2V at 100%
      if (s < 0.1) {
        return spec.cutoffVoltage + (3.45 - spec.cutoffVoltage) * (s / 0.1);
      } else if (s > 0.9) {
        return 4.05 + (spec.maxVoltage - 4.05) * ((s - 0.9) / 0.1);
      } else {
        // Flat plateau between 10% and 90%
        return 3.45 + (4.05 - 3.45) * Math.pow((s - 0.1) / 0.8, 0.9);
      }

    case 'lipo':
      // High discharge LiPo curve: steep initial drop, long 3.7V - 3.85V plateau
      if (s < 0.1) {
        return spec.cutoffVoltage + (3.50 - spec.cutoffVoltage) * (s / 0.1);
      } else if (s > 0.85) {
        return 4.02 + (spec.maxVoltage - 4.02) * ((s - 0.85) / 0.15);
      } else {
        return 3.50 + (4.02 - 3.50) * Math.pow((s - 0.1) / 0.75, 0.85);
      }

    case 'nimh':
      // NiMH has a very flat 1.20 - 1.25V plateau, steep knee at 1.0V, peak at 1.45V
      if (s < 0.15) {
        return spec.cutoffVoltage + (1.18 - spec.cutoffVoltage) * (s / 0.15);
      } else if (s > 0.85) {
        return 1.28 + (spec.maxVoltage - 1.28) * Math.pow((s - 0.85) / 0.15, 1.4);
      } else {
        return 1.18 + (1.28 - 1.18) * ((s - 0.15) / 0.7);
      }

    case 'lifepo4':
      // Ultra-flat 3.20V plateau across 15% to 85%
      if (s < 0.1) {
        return spec.cutoffVoltage + (3.15 - spec.cutoffVoltage) * (s / 0.1);
      } else if (s > 0.9) {
        return 3.35 + (spec.maxVoltage - 3.35) * ((s - 0.9) / 0.1);
      } else {
        return 3.15 + (3.35 - 3.15) * ((s - 0.1) / 0.8);
      }

    case 'lead-acid':
      // Linear slope from 1.75V (0%) to 2.12V (100% resting OCV) up to 2.45V charging
      return spec.cutoffVoltage + (2.12 - spec.cutoffVoltage) * Math.pow(s, 0.8);

    case 'solid-state':
      // High voltage lithium metal: 2.7V to 4.4V with smooth curve
      if (s < 0.1) {
        return spec.cutoffVoltage + (3.60 - spec.cutoffVoltage) * (s / 0.1);
      } else if (s > 0.9) {
        return 4.20 + (spec.maxVoltage - 4.20) * ((s - 0.9) / 0.1);
      } else {
        return 3.60 + (4.20 - 3.60) * ((s - 0.1) / 0.8);
      }

    default:
      return spec.nominalVoltage;
  }
}

// Exact inverse of the OCV curve (binary search) — used so manual edits change real cell state
export function socFromVoltage(voltage: number, chemistry: BatteryChemistryType): number {
  let lo = 0;
  let hi = 100;
  if (voltage <= calculateOcvFromSoc(0, chemistry)) return 0;
  if (voltage >= calculateOcvFromSoc(100, chemistry)) return 100;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (calculateOcvFromSoc(mid, chemistry) < voltage) lo = mid;
    else hi = mid;
  }
  return Number(((lo + hi) / 2).toFixed(3));
}

// Gaussian-ish sensor noise
function noise(amplitude: number): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * (amplitude / 1.5);
}

// Instantaneous pack current from mode + load profile (real drive cycles, not a constant)
export function computeProfileCurrent(
  mode: SimulationMode,
  profile: string,
  config: PackConfig,
  simTimeSec: number,
  maxCellVoltage: number,
  minCellVoltage: number,
  spec: ChemistrySpec,
  packSoc: number
): number {
  const t = simTimeSec;
  if (mode === 'charging_cccv') {
    if (packSoc >= 99.9) return 0;
    // CC until the highest cell nears Vmax, then CV taper
    const taper = Math.max(0.04, Math.min(1, (spec.maxVoltage + 0.01 - maxCellVoltage) / 0.06));
    return config.chargeCurrent * taper * (1 + noise(0.01));
  }
  if (mode === 'stress_test') {
    // Overload stress test (UL 1973-style overload abuse): discharge ramps from 50% to 130%
    // of the pack's rated C-limit over 30 s, so every cell type is driven through its
    // pre-alarm band and past its protection limit.
    if (minCellVoltage <= spec.cutoffVoltage) return 0;
    const ratedA = (spec.typicalCapacity / 1000) * config.parallelCount * spec.maxDischargeC;
    const ramp = Math.min(1, t / 30);
    return -ratedA * (0.5 + 0.8 * ramp) * (1 + noise(0.01));
  }
  if (mode === 'discharging_load') {
    // BMS UVP disconnects the load
    if (minCellVoltage <= spec.cutoffVoltage) return 0;
    const base = config.loadCurrent;
    let factor = 1;
    switch (profile) {
      case 'ev_cruise':
        factor = 1 + 0.12 * Math.sin(t / 3.2) + 0.05 * Math.sin(t * 1.7);
        break;
      case 'ev_sport':
        factor = t % 12 < 3.5 ? 1 : 0.3 + 0.05 * Math.sin(t);
        break;
      case 'drone_hover':
        factor = 1 + 0.07 * Math.sin(t * 1.9) + 0.04 * Math.sin(t * 5.3);
        break;
      case 'drone_acro':
        factor = Math.sin(t * 0.8) > 0.2 ? 1 : 0.35 + 0.1 * Math.sin(t * 3);
        break;
      case 'solar_storage':
        factor = 0.75 + 0.25 * Math.sin(t / 6);
        break;
      case 'power_tool_pulse':
        factor = t % 3.5 < 2 ? 1 : 0.05;
        break;
      default:
        factor = 1 + 0.04 * Math.sin(t / 2.5);
    }
    return -Math.max(0, base * factor * (1 + noise(0.02)));
  }
  if (mode === 'balancing_active' || mode === 'balancing_passive') {
    return -0.3 + noise(0.02);
  }
  // Idle: only BMS quiescent draw + sensor offset noise
  return -0.04 + noise(0.015);
}

// Estimate SoC from voltage
export function estimateSocFromOcv(voltage: number, chemistry: BatteryChemistryType): number {
  const spec = BATTERY_CHEMISTRIES[chemistry];
  if (voltage >= spec.maxVoltage) return 100;
  if (voltage <= spec.cutoffVoltage) return 0;
  
  // Approximate inverted calculation
  const range = spec.maxVoltage - spec.cutoffVoltage;
  const ratio = (voltage - spec.cutoffVoltage) / range;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

// Generate initial stack of cells
export function initializeCellStack(
  seriesCount: number,
  parallelCount: number,
  chemistry: BatteryChemistryType,
  initialSoc = 75,
  addRealisticImbalance = true
): CellData[] {
  const spec = BATTERY_CHEMISTRIES[chemistry];
  const cells: CellData[] = [];
  const totalCells = seriesCount * parallelCount;

  for (let i = 0; i < totalCells; i++) {
    const seriesIndex = Math.floor(i / parallelCount);
    const parallelIndex = i % parallelCount;

    // Slight realistic cell-to-cell variance (±1.5% SoC, ±0.8mΩ IR)
    const socVariance = addRealisticImbalance ? (Math.sin(i * 1.7) * 2.5 + (i === 1 ? -4.5 : 0) + (i === seriesCount - 1 ? 3.0 : 0)) : 0;
    const cellSoc = Math.max(5, Math.min(99, initialSoc + socVariance));
    
    const irVariance = addRealisticImbalance ? (Math.cos(i * 2.3) * 0.12 * spec.typicalIR) : 0;
    const cellIr = Math.max(0.1, Number((spec.typicalIR + irVariance).toFixed(2)));

    const baseOcv = calculateOcvFromSoc(cellSoc, chemistry);
    const cellVoltage = Number(baseOcv.toFixed(3));

    const capacityNominal = spec.typicalCapacity;
    const capacityRemaining = Math.round((cellSoc / 100) * capacityNominal);

    const history = [];
    const now = Date.now();
    const baseTemp = 25.0 + Number((Math.sin(i * 0.8) * 1.2).toFixed(1));
    for (let h = 47; h >= 0; h--) {
      const adcNoise = Math.sin(h * 0.55 + i * 1.3) * 0.003 + Math.cos(h * 0.21) * 0.0015;
      history.push({
        time: now - h * 200,
        voltage: Number((cellVoltage + adcNoise).toFixed(4)),
        current: 0,
        temperature: Number((baseTemp + Math.sin(h * 0.18) * 0.12).toFixed(2)),
        soc: Number(cellSoc.toFixed(2)),
      });
    }

    cells.push({
      id: i + 1,
      label: `Cell #${i + 1}${parallelCount > 1 ? ` (${seriesIndex + 1}S-${parallelIndex + 1}P)` : ''}`,
      voltage: cellVoltage,
      nominalVoltage: spec.nominalVoltage,
      maxVoltage: spec.maxVoltage,
      minVoltage: spec.cutoffVoltage,
      soc: Number(cellSoc.toFixed(1)),
      soh: 98 - Math.floor((i % 4) * 1.5),
      temperature: 25.0 + Number((Math.sin(i * 0.8) * 1.2).toFixed(1)),
      internalResistance: cellIr,
      capacityNominal,
      capacityRemaining,
      cycles: 42 + (i * 3),
      isBalancing: false,
      balanceBleedCurrent: 0,
      status: 'normal',
      faultType: 'none',
      history,
      row: Math.floor(i / 4),
      col: i % 4,
      parallelGroup: parallelIndex,
    });
  }

  return cells;
}

// Electrochemical Step Simulation Tick
export function stepSimulationTick(
  cells: CellData[],
  spec: ChemistrySpec,
  mode: SimulationMode,
  config: PackConfig,
  effectiveCurrent: number, // Positive for charging, Negative for discharging
  dtSeconds: number
): { updatedCells: CellData[]; logs: string[] } {
  const logs: string[] = [];
  const ambientTemp = config.ambientTemp;
  const isCooling = config.activeCooling;
  const balanceThreshold = config.balanceThresholdMv / 1000; // in Volts

  // Determine highest and lowest voltages for balancing logic
  let highestVoltage = -Infinity;
  let lowestVoltage = Infinity;
  let highestCellIdx = -1;
  let lowestCellIdx = -1;

  cells.forEach((cell, idx) => {
    if (cell.voltage > highestVoltage) {
      highestVoltage = cell.voltage;
      highestCellIdx = idx;
    }
    if (cell.voltage < lowestVoltage) {
      lowestVoltage = cell.voltage;
      lowestCellIdx = idx;
    }
  });

  const deltaV = highestVoltage - lowestVoltage;
  const shouldBalance = (mode === 'balancing_active' || mode === 'balancing_passive' || (mode === 'charging_cccv' && deltaV > balanceThreshold));

  const updatedCells = cells.map((cell, idx) => {
    let current = effectiveCurrent / config.parallelCount; // current through this specific cell
    let isBalancing = false;
    let balanceBleed = 0;

    // Balancing Action — currents scale with cell capacity so equalisation is visible
    const capAhNominal = cell.capacityNominal / 1000;
    const passiveMa = Math.round(Math.min(1500, Math.max(150, capAhNominal * 100)));
    const activeMa = Math.round(Math.min(6000, Math.max(1200, capAhNominal * 300)));
    if (shouldBalance) {
      if (mode === 'balancing_passive' || mode === 'charging_cccv') {
        if (cell.voltage > lowestVoltage + balanceThreshold && cell.soc > 5) {
          isBalancing = true;
          balanceBleed = passiveMa;
          current -= balanceBleed / 1000;
        }
      } else if (mode === 'balancing_active') {
        if (idx === highestCellIdx && deltaV > balanceThreshold) {
          isBalancing = true;
          balanceBleed = activeMa;
          current -= balanceBleed / 1000;
        } else if (idx === lowestCellIdx && deltaV > balanceThreshold) {
          isBalancing = true;
          balanceBleed = -Math.round(activeMa * 0.9);
          current += (activeMa * 0.9) / 1000;
        }
      }
    } else if (cell.isBalancing && cell.balanceBleedCurrent > 0 && mode === 'idle') {
      // Manual override from Cell Lab keeps bleeding
      isBalancing = true;
      balanceBleed = passiveMa;
      current -= balanceBleed / 1000;
    }

    // Micro-short fault injection discharge
    if (cell.faultType === 'dendrite_micro_short') {
      current -= 2.0; // severe parasitic drain
    }

    // Update SoC: ΔSoC = (I * Δt / Capacity) * 100
    // Capacity in mAh -> convert to Ah
    const capacityAh = (cell.capacityNominal * (cell.soh / 100)) / 1000;
    const deltaSoc = (current * (dtSeconds / 3600) / capacityAh) * 100;
    let newSoc = Math.max(0, Math.min(100, cell.soc + deltaSoc));

    // Self-discharge (very small, chemistry dependent) so idle is never perfectly frozen
    const selfDischargePerSec = spec.id === 'nimh' ? 0.00012 : spec.id === 'lead-acid' ? 0.00006 : 0.00002;
    newSoc = Math.max(0, newSoc - selfDischargePerSec * dtSeconds);

    // Calculate open-circuit voltage
    const ocv = calculateOcvFromSoc(newSoc, spec.id);

    // Equivalent-circuit model: V = OCV + I·R0 + Vrc  (RC branch gives sag on load, recovery on rest)
    const irOhms = cell.internalResistance / 1000;
    const r1Ohms = irOhms * 0.7;
    const tau = spec.id === 'lead-acid' ? 25 : spec.id === 'lifepo4' ? 14 : spec.id === 'nimh' ? 10 : 8;
    const prevVrc = cell.polarization ?? 0;
    const vrc = prevVrc + (current * r1Ohms - prevVrc) * (1 - Math.exp(-dtSeconds / tau));

    // ADC measurement noise: ~1 mV for Li chemistries, scaled for low-voltage cells
    const adcNoise = noise(spec.nominalVoltage < 2.5 ? 0.0008 : 0.0012);
    let terminalVoltage = ocv + current * irOhms + vrc + adcNoise;

    // Clamp within physical boundaries (forced values only for injected faults)
    if (cell.injectedFault && cell.faultType === 'over_voltage') {
      terminalVoltage = spec.maxVoltage + 0.15 + adcNoise;
    } else if (cell.injectedFault && cell.faultType === 'under_voltage') {
      terminalVoltage = spec.cutoffVoltage - 0.22 + adcNoise;
    } else {
      terminalVoltage = Math.max(spec.cutoffVoltage * 0.85, Math.min(spec.maxVoltage * 1.08, terminalVoltage));
    }

    // Thermal Modeling:
    // Joule heating: P = I^2 * R_int + Overpotential loss
    const jouleHeatWatts = Math.pow(current, 2) * irOhms;
    const balancingHeatWatts = isBalancing ? (balanceBleed / 1000) * 0.25 : 0;
    const faultHeatWatts = cell.faultType === 'thermal_runaway' ? 25.0 : (cell.faultType === 'high_temp' ? 4.0 : 0);

    const totalHeatWatts = jouleHeatWatts + balancingHeatWatts + faultHeatWatts;
    
    // Thermal dissipation to ambient
    const coolingFactor = isCooling ? 0.35 : 0.08;
    // Thermal mass scales with cell size (calibrated on a ~3.5 Ah cell); cooling area ∝ mass^(2/3).
    const thermalMass = Math.max(1, cell.capacityNominal / 1000 / 3.5);
    const deltaTemp =
      ((totalHeatWatts * 0.45 - (cell.temperature - ambientTemp) * coolingFactor * Math.pow(thermalMass, 2 / 3)) / thermalMass) *
      (dtSeconds / 2.0);
    let newTemp = Math.max(ambientTemp - 2, cell.temperature + deltaTemp);

    if (cell.faultType === 'thermal_runaway') {
      newTemp = Math.min(180, cell.temperature + 4.5 * dtSeconds);
    }

    // Fault Status Evaluation — injected faults latch; measured violations are re-evaluated every tick
    let status: CellStatus = 'normal';
    let faultType: CellFaultType =
      cell.injectedFault || cell.faultType === 'thermal_runaway' ? cell.faultType : 'none';

    if (cell.injectedFault && faultType !== 'none' && faultType !== 'thermal_runaway') {
      status = faultType === 'high_temp' || faultType === 'high_ir' ? 'warning' : 'fault';
    } else if (newTemp >= spec.thermalRunawayTemp || cell.faultType === 'thermal_runaway') {
      status = 'critical';
      faultType = 'thermal_runaway';
    } else if (terminalVoltage > spec.maxVoltage + 0.05) {
      status = 'fault';
      faultType = 'over_voltage';
    } else if (terminalVoltage < spec.cutoffVoltage - 0.05) {
      status = 'fault';
      faultType = 'under_voltage';
    } else if (newTemp > spec.tempMax) {
      status = 'warning';
      if (faultType === 'none') faultType = 'high_temp';
    } else if (cell.internalResistance > spec.typicalIR * 2.5) {
      status = 'warning';
      if (faultType === 'none') faultType = 'high_ir';
    } else if (isBalancing) {
      status = 'balancing';
    } else if (current > 0.1) {
      status = 'charging';
    } else if (current < -0.1) {
      status = 'discharging';
    }

    // History update (thermistor reading includes ±0.05 °C sensor noise)
    const now = Date.now();
    const updatedHistory = [
      ...cell.history.slice(-(CELL_HISTORY_LIMIT - 1)),
      {
        time: now,
        voltage: Number(terminalVoltage.toFixed(4)),
        current: Number(current.toFixed(3)),
        temperature: Number((newTemp + noise(0.05)).toFixed(3)),
        soc: Number(newSoc.toFixed(4)),
      }
    ];

    const capacityRemaining = Math.round((newSoc / 100) * cell.capacityNominal);

    // Store FULL precision state (rounding every tick swallowed small deltas and froze SoC/temp)
    return {
      ...cell,
      voltage: Number(terminalVoltage.toFixed(4)),
      soc: Number(newSoc.toFixed(5)),
      temperature: Number(newTemp.toFixed(4)),
      polarization: Number(vrc.toFixed(6)),
      capacityRemaining,
      isBalancing,
      balanceBleedCurrent: Math.abs(balanceBleed),
      status,
      faultType,
      history: updatedHistory,
    };
  });

  return { updatedCells, logs };
}
