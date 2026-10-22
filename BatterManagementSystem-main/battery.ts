export type BatteryChemistryType = 
  | 'li-ion' 
  | 'lipo' 
  | 'nimh' 
  | 'lifepo4' 
  | 'lead-acid' 
  | 'solid-state';

export type CellFormFactor = 
  | 'cylindrical_18650' 
  | 'cylindrical_21700' 
  | 'pouch_flat' 
  | 'prismatic_hardcase' 
  | 'cylindrical_nimh' 
  | 'lead_acid_monoblock';

export type CellStatus = 
  | 'normal' 
  | 'balancing' 
  | 'warning' 
  | 'fault' 
  | 'charging' 
  | 'discharging' 
  | 'critical';

export type CellFaultType = 
  | 'none' 
  | 'over_voltage' 
  | 'under_voltage' 
  | 'high_temp' 
  | 'high_ir' 
  | 'dendrite_micro_short' 
  | 'thermal_runaway';

export interface VoltageHistoryPoint {
  time: number;
  voltage: number;
  current: number;
  temperature: number;
  soc: number;
}

export interface CellData {
  id: number;
  label: string;
  voltage: number; // Volts (V)
  nominalVoltage: number;
  maxVoltage: number;
  minVoltage: number;
  soc: number; // State of Charge (0-100%)
  soh: number; // State of Health (0-100%)
  temperature: number; // Degrees Celsius (°C)
  internalResistance: number; // milliOhms (mΩ)
  capacityNominal: number; // mAh
  capacityRemaining: number; // mAh
  cycles: number;
  isBalancing: boolean;
  balanceBleedCurrent: number; // mA
  status: CellStatus;
  faultType: CellFaultType;
  history: VoltageHistoryPoint[];
  polarization?: number; // RC-branch voltage (V) for transient sag / recovery
  injectedFault?: boolean; // true only when a fault was injected from the Cell Lab (latches)
  // Physical coordinates or positions in stack
  row: number;
  col: number;
  parallelGroup: number;
}

export interface ChemistrySpec {
  id: BatteryChemistryType;
  name: string;
  shortName: string;
  fullName: string;
  formula: string;
  formFactorName: string;
  formFactorType: CellFormFactor;
  nominalVoltage: number;
  maxVoltage: number;
  cutoffVoltage: number;
  typicalCapacity: number; // mAh per cell
  typicalIR: number; // mΩ
  energyDensity: number; // Wh/kg
  cycleLife: number; // typical cycles
  maxDischargeC: number; // C-rate
  maxChargeC: number; // C-rate
  tempMin: number; // °C
  tempMax: number; // °C
  thermalRunawayTemp: number; // °C
  primaryApplications: string[];
  cathodeMaterial: string;
  anodeMaterial: string;
  electrolyteType: string;
  separatorType: string;
  housingMaterial: string;
  chemicalReaction: {
    charge: string;
    discharge: string;
  };
  features: string[];
  safetyRating: 'A+' | 'A' | 'B+' | 'B' | 'C';
  costTier: '$' | '$$' | '$$$' | '$$$$';
  internalLayers: {
    name: string;
    material: string;
    color: string;
    thickness: string;
    description: string;
  }[];
  accentColor: string;
  gradient: string;
  badgeBg: string;
  borderColor: string;
  textColor: string;
}

export type ViewMode = 
  | 'physical' 
  | 'schematic' 
  | 'thermal' 
  | 'delta' 
  | 'anatomy';

export type SimulationMode = 
  | 'idle' 
  | 'charging_cccv' 
  | 'discharging_load' 
  | 'balancing_active' 
  | 'balancing_passive' 
  | 'stress_test';

export type LoadProfile = 
  | 'custom'
  | 'ev_cruise'
  | 'ev_sport'
  | 'drone_hover'
  | 'drone_acro'
  | 'solar_storage'
  | 'power_tool_pulse'
  | 'fast_charge'
  | 'slow_trickle';

export interface BmsTelemetry {
  packVoltage: number;
  packCurrent: number; // Positive = Charging, Negative = Discharging
  packPower: number; // Watts
  packSoC: number; // %
  packSoH: number; // %
  packCapacityRemaining: number; // Ah
  packCapacityTotal: number; // Ah
  packEnergyRemaining: number; // Wh
  minVoltage: number;
  minVoltageCellId: number;
  maxVoltage: number;
  maxVoltageCellId: number;
  avgVoltage: number;
  deltaVoltage: number; // mV
  avgTemperature: number;
  maxTemperature: number;
  maxTempCellId: number;
  minTemperature: number;
  coolingFanSpeed: number; // 0 to 100%
  bmsState: SimulationMode;
  safetyRelayClosed: boolean;
  warnings: string[];
  faults: string[];
  estimatedTimeRemainingSec: number; // seconds
}

export interface PackConfig {
  seriesCount: number; // 2 to 16
  parallelCount: number; // 1 to 4
  ambientTemp: number; // °C
  loadCurrent: number; // A (requested)
  chargeCurrent: number; // A (requested)
  activeCooling: boolean;
  simulationSpeed: number; // 1x, 2x, 5x, 10x
  balanceThresholdMv: number; // e.g. 10mV
}

export interface SessionSnapshot {
  time: number;
  elapsedMs: number;
  packVoltage: number;
  packCurrent: number;
  packPower: number;
  packSoC: number;
  avgTemp: number;
  maxTemp: number;
  deltaMv: number;
  minVoltage: number;
  maxVoltage: number;
}

export interface SimulationSession {
  isRunning: boolean;
  startedAt: number | null;
  stoppedAt: number | null;
  elapsedMs: number;
  tickCount: number;
  physicsTimeSec: number;
  snapshots: SessionSnapshot[];
}
