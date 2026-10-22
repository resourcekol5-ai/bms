import { BmsTelemetry, CellData, ChemistrySpec } from '../types/battery';

export type AlarmKey =
  | 'runaway'
  | 'overcurrent'
  | 'overvoltage'
  | 'undervoltage'
  | 'overtemp'
  | 'imbalance'
  | 'lowsoc'
  | 'watch';

/** Each warning carries 3 distinct industrial responses:
 *  tier 'auto'    = auto-correct, pack stays online
 *  tier 'trip'    = hard protection, isolates the pack
 *  tier 'service' = diagnostic / staged recovery action
 *  `code` is the ANSI-style action tag shown on the option badge (e.g. "51-A"). */
export interface AlarmSolution {
  id: string;
  tier: 'auto' | 'trip' | 'service';
  code: string;
  action: string;
  label: string;
  description: string;
}

export interface Alarm {
  key: AlarmKey;
  /** warning = pre-alarm band, critical = protection limit exceeded / trip level */
  severity: 'warning' | 'critical';
  title: string;
  /** What is wrong, stated with the live numbers */
  detail: string;
  /** Most likely root cause */
  cause: string;
  /** Consequence if the condition is left uncorrected */
  risk: string;
  /** Industry standard / ANSI function the protection is based on */
  standard: string;
  cellId?: number;
  measured: string;
  limit: string;
  /** Gauge: 0.85 = pre-alarm threshold, 1.0 = protection limit, >1 = beyond limit */
  ratio: number;
  solutions: [AlarmSolution, AlarmSolution, AlarmSolution];
}

/** One tracked alarm episode — recorded in the event log and exported in reports. */
export interface AlarmRecord {
  id: string;
  key: AlarmKey;
  severity: 'warning' | 'critical';
  title: string;
  cellId?: number;
  measured: string;
  limit: string;
  raisedAt: number;
  resolvedAt: number | null;
  actionTaken: string | null; // label of the applied industrial action
  outcome: 'pending' | 'resolved' | 'deferred' | 'auto-cleared';
}

const ORDER: Record<AlarmKey, number> = {
  runaway: 0,
  overvoltage: 1,
  undervoltage: 2,
  overcurrent: 3,
  overtemp: 4,
  imbalance: 5,
  lowsoc: 6,
  watch: 7,
};

/** Linear gauge: 0.85 at the pre-alarm threshold, 1.0 at the protection limit (works in either direction). */
function gauge(x: number, warnAt: number, limitAt: number): number {
  if (warnAt === limitAt) return 1;
  return 0.85 + (0.15 * (x - warnAt)) / (limitAt - warnAt);
}

/**
 * Rated current limit of the pack for the present direction of flow.
 * Scales with the selected cell type: capacity × parallel strings × C-rate rating.
 */
export function currentLimitA(t: BmsTelemetry, spec: ChemistrySpec): { limitA: number; direction: 'discharge' | 'charge' } {
  // Guard against undefined/NaN telemetry (e.g. state restored from older storage)
  const capAh = Number.isFinite(t.packCapacityTotal) && t.packCapacityTotal > 0 ? t.packCapacityTotal : 1;
  const discharge = t.packCurrent <= 0;
  const cRate = discharge ? spec.maxDischargeC : spec.maxChargeC;
  const limitA = capAh * cRate;
  return {
    limitA: Number.isFinite(limitA) && limitA > 0 ? limitA : Math.max(1, capAh),
    direction: discharge ? 'discharge' : 'charge',
  };
}

/** Scans the live pack state and returns every active threat (pre-alarm or trip), worst first. */
export function evaluateAlarms(t: BmsTelemetry, cells: CellData[], spec: ChemistrySpec): Alarm[] {
  const alarms: Alarm[] = [];
  const running = Math.abs(t.packCurrent) > 0.05;
  const chName = spec.name;

  // ── 1. THERMAL RUNAWAY ─────────────────────────────────────────────
  const runaway = cells.find((c) => c.faultType === 'thermal_runaway' || c.temperature >= spec.thermalRunawayTemp);
  if (runaway) {
    alarms.push({
      key: 'runaway',
      severity: 'critical',
      title: 'THERMAL RUNAWAY — ANSI 49 / NFPA 855',
      detail: `Cell #${runaway.id} (${chName}) is at ${runaway.temperature.toFixed(0)} °C — above the ${spec.thermalRunawayTemp} °C runaway threshold. The cell is self-heating (exothermic) and no longer controlled by the load.`,
      cause: 'Internal short / separator breach, sustained overload, or cooling failure drove the cell past its thermal stability limit.',
      risk: 'Venting, fire and heat propagation to neighbouring cells within seconds. Whole-pack loss.',
      standard: 'UL 9540A (propagation test) · IEC 62619 · IEEE C37.2 fn 49',
      cellId: runaway.id,
      measured: `${runaway.temperature.toFixed(1)} °C`,
      limit: `${spec.thermalRunawayTemp} °C runaway`,
      ratio: gauge(runaway.temperature, spec.thermalRunawayTemp - 15, spec.thermalRunawayTemp),
      solutions: [
        {
          id: 'isolate_cell_only',
          tier: 'auto',
          code: '49-A',
          action: 'QUENCH',
          label: `Quench CH${String(runaway.id).padStart(2, '0')} & fan to 100%`,
          description: `Returns the failed cell to a safe thermal state and locks the fan controller at full speed until it is below ${spec.tempMax} °C. Remaining cells stay online.`,
        },
        {
          id: 'isolate_and_shutdown',
          tier: 'trip',
          code: '49-B',
          action: 'EPO TRIP',
          label: 'EPO — open K1/K2, de-energise pack',
          description: 'Emergency Power Off: trips both main DC contactors to zero all bus current, forces full cooling and quarantines the failed cell pending inspection.',
        },
        {
          id: 'runaway_bypass_n1',
          tier: 'service',
          code: '49-C',
          action: 'N-1 BYPASS',
          label: 'Bypass faulty section — N-1 operation at 50%',
          description: 'Quarantines the failed cell, derates the string to 50% load and keeps the bus energised on the remaining healthy cells. Schedule module replacement.',
        },
      ],
    });
  }

  // ── 2. OVERCURRENT (limit follows the selected cell type's C-rate rating) ──
  const { limitA, direction } = currentLimitA(t, spec);
  const absI = Math.abs(t.packCurrent);
  if (absI >= 0.85 * limitA) {
    const critical = absI > limitA;
    const cRate = absI / Math.max(0.1, t.packCapacityTotal);
    const safeA = Math.max(1, Math.round(0.7 * limitA));
    alarms.push({
      key: 'overcurrent',
      severity: critical ? 'critical' : 'warning',
      title: critical ? 'OVERCURRENT — ANSI 50/51 TRIP LEVEL' : 'HIGH CURRENT — ANSI 50/51 PRE-ALARM',
      detail: `Bus ${direction} current is ${absI.toFixed(1)} A (${cRate.toFixed(2)} C). The ${chName} string is rated ${limitA.toFixed(0)} A (${direction === 'discharge' ? spec.maxDischargeC : spec.maxChargeC} C) — ${critical ? 'the rating is exceeded' : 'it is within 15% of the rating'}.`,
      cause:
        direction === 'discharge'
          ? 'Load / inverter demand above what the cells can supply, motor stall or inrush, or a downstream short.'
          : 'Charger set above the cells\' charge C-rate, or a charger regulation fault.',
      risk: 'I²R heating of cells and busbars, accelerated ageing, lithium plating (charge), fuse F1 melt and pack lock-out.',
      standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 50/51 (instantaneous / time-overcurrent)',
      measured: `${absI.toFixed(1)} A`,
      limit: `${limitA.toFixed(0)} A rated`,
      ratio: gauge(absI, 0.85 * limitA, limitA),
      solutions: [
        {
          id: 'throttle_current',
          tier: 'auto',
          code: '51-A',
          action: 'DERATE',
          label: `Derate ${direction === 'discharge' ? 'converter' : 'charger'} to ${safeA} A`,
          description: `Steps the ${direction === 'discharge' ? 'drive / inverter' : 'charger'} current command down to ≤ ${safeA} A (70% of the ${limitA.toFixed(0)} A rating) so the bus stays energised with full protection margin.`,
        },
        {
          id: 'oc_trip_k1k2',
          tier: 'trip',
          code: '51-B',
          action: 'TRIP K1/K2',
          label: 'Trip main contactor K1/K2 (bus off)',
          description: 'Opens both main DC contactors to zero the bus current, latches the 50/51 trip and holds the pack de-energised until it is reset.',
        },
        {
          id: 'oc_staged_restart',
          tier: 'service',
          code: '51-C',
          action: 'STAGED RESTART',
          label: `Staged restart at 50% (${Math.max(1, Math.round(0.5 * limitA))} A)`,
          description: 'Re-applies the load in verified stages at half rating to confirm the overload has cleared before full current is restored.',
        },
      ],
    });
  }

  // Voltage bands scale with the cell's nominal voltage (a 1.2 V NiMH cell needs narrower bands than 3.7 V Li-ion)
  const vb = spec.nominalVoltage / 3.7;

  // ── 3. CELL OVER-VOLTAGE ───────────────────────────────────────────
  const ovWarn = spec.maxVoltage - 0.03 * vb;
  if (t.maxVoltage >= ovWarn) {
    const critical = t.maxVoltage > spec.maxVoltage + 0.05 * vb;
    alarms.push({
      key: 'overvoltage',
      severity: critical ? 'critical' : 'warning',
      title: critical ? 'CELL OVER-VOLTAGE — ANSI 59 TRIP' : 'HIGH CELL VOLTAGE — ANSI 59 PRE-ALARM',
      detail: `Cell #${t.maxVoltageCellId} is at ${t.maxVoltage.toFixed(3)} V against a ${spec.maxVoltage.toFixed(2)} V ${chName} maximum — ${critical ? 'beyond the trip level' : 'inside the pre-alarm band'}.`,
      cause: 'Charging past end-of-charge on the highest cell, cell imbalance concentrating charge in one cell, or charger CV regulation drift.',
      risk: 'Electrolyte decomposition, gas generation, lithium plating and permanent capacity loss; at trip level, venting risk.',
      standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 59 (overvoltage)',
      cellId: t.maxVoltageCellId,
      measured: `${t.maxVoltage.toFixed(3)} V`,
      limit: `${spec.maxVoltage.toFixed(2)} V max`,
      ratio: gauge(t.maxVoltage, ovWarn, spec.maxVoltage),
      solutions: [
        {
          id: 'ovp_drip_balance',
          tier: 'auto',
          code: '59-A',
          action: 'TRICKLE+BAL',
          label: 'Charger to 2 A trickle + active balance',
          description: 'Reduces charger output to a 2 A maintenance trickle and closes the balancing switch matrix to bleed the high cell back inside the window.',
        },
        {
          id: 'ovp_full_stop',
          tier: 'trip',
          code: '59-B',
          action: 'TRIP CHARGE',
          label: 'Trip charge contactor + deep balance',
          description: `Cuts charge power completely, then balances continuously until every cell is below ${(spec.maxVoltage - 0.05 * vb).toFixed(2)} V before charge is re-permitted.`,
        },
        {
          id: 'ovp_recalibrate_cv',
          tier: 'service',
          code: '59-C',
          action: 'RECALIBRATE CV',
          label: 'Recalibrate charger CV −50 mV/cell + verify sense',
          description: 'Drops the charger to a 1 A hold, flags the CV setpoint for recalibration 50 mV/cell lower and verifies the AFE sense leads before charge is re-enabled.',
        },
      ],
    });
  }

  // ── 4. CELL UNDER-VOLTAGE ──────────────────────────────────────────
  const uvWarn = spec.cutoffVoltage + 0.1 * vb;
  if (t.minVoltage <= uvWarn) {
    const critical = t.minVoltage < spec.cutoffVoltage - 0.05 * vb;
    alarms.push({
      key: 'undervoltage',
      severity: critical ? 'critical' : 'warning',
      title: critical ? 'CELL UNDER-VOLTAGE — ANSI 27 TRIP' : 'LOW CELL VOLTAGE — ANSI 27 PRE-ALARM',
      detail: `Cell #${t.minVoltageCellId} is at ${t.minVoltage.toFixed(3)} V against a ${spec.cutoffVoltage.toFixed(2)} V ${chName} cutoff — ${critical ? 'below the trip level' : 'inside the pre-alarm band'}.`,
      cause: 'Deep discharge of the weakest cell, high load causing IR sag, or a high-impedance (aged) cell.',
      risk: 'Copper dissolution at the anode and polarity reversal — permanent damage and a latent internal-short hazard.',
      standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 27 (undervoltage)',
      cellId: t.minVoltageCellId,
      measured: `${t.minVoltage.toFixed(3)} V`,
      limit: `${spec.cutoffVoltage.toFixed(2)} V min`,
      ratio: gauge(t.minVoltage, uvWarn, spec.cutoffVoltage),
      solutions: [
        {
          id: 'reduce_load',
          tier: 'auto',
          code: '27-A',
          action: 'SHED LOAD',
          label: 'Shed 75% of bus load',
          description: `Steps the discharge command to 25% of its present value to hold the weak cell above the ${spec.cutoffVoltage.toFixed(2)} V cutoff while the pack keeps serving the bus.`,
        },
        {
          id: 'uv_open_discharge',
          tier: 'trip',
          code: '27-B',
          action: 'BUS OFF',
          label: 'Open discharge contactor (bus off)',
          description: 'Trips the main DC contactors to remove the load and lets the string recover, then permits re-closing with a reduced load command.',
        },
        {
          id: 'uv_recovery_charge',
          tier: 'service',
          code: '27-C',
          action: 'RECOVERY CHG',
          label: `Soft-start recovery charge at ${(0.2 * Math.max(0.1, t.packCapacityTotal)).toFixed(1)} A (0.2 C)`,
          description: 'Applies a gentle 0.2 C recovery charge to lift the weak cell above cutoff without stressing it, then hands back to normal operation.',
        },
      ],
    });
  }

  // ── 5. THERMAL OVERLOAD ────────────────────────────────────────────
  const otWarn = spec.tempMax - 8;
  if (!runaway && t.maxTemperature >= otWarn) {
    const critical = t.maxTemperature > spec.tempMax;
    alarms.push({
      key: 'overtemp',
      severity: critical ? 'critical' : 'warning',
      title: critical ? 'THERMAL OVERLOAD — ANSI 49 TRIP LEVEL' : 'HIGH TEMPERATURE — ANSI 49 PRE-ALARM',
      detail: `Peak cell #${t.maxTempCellId} is at ${t.maxTemperature.toFixed(1)} °C against a ${spec.tempMax} °C continuous limit for ${chName}.${running ? ' Bus current is generating I²R heat inside the pack.' : ' Residual heat is still dissipating.'}`,
      cause: running
        ? 'Sustained load current heating the cells faster than the cooling can remove it, or an ambient / fan problem.'
        : 'Heat soak after a high-current run, or inadequate cooling.',
      risk: 'Faster ageing and SEI growth, loss of capacity; continued rise leads to thermal runaway.',
      standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 49 (thermal relay)',
      cellId: t.maxTempCellId,
      measured: `${t.maxTemperature.toFixed(1)} °C`,
      limit: `${spec.tempMax} °C`,
      ratio: gauge(t.maxTemperature, otWarn, spec.tempMax),
      solutions: [
        {
          id: 'cooling_only',
          tier: 'auto',
          code: '49T-A',
          action: 'FAN 100%',
          label: 'Thermal fan controller to 100%',
          description: `Commands the cooling fan to full speed and holds it until the peak cell is back under ${spec.tempMax} °C.`,
        },
        {
          id: 'cool_and_derate',
          tier: 'trip',
          code: '49T-B',
          action: 'FAN+DERATE',
          label: 'Fan 100% + derate current 75%',
          description: 'Full-speed cooling plus a 75% step-down of the charge/discharge command to cut I²R heat at its source while the pack cools.',
        },
        {
          id: 'ot_soak',
          tier: 'service',
          code: '49T-C',
          action: 'THERMAL SOAK',
          label: 'Thermal soak: idle + fan 100% until cool',
          description: 'Parks the pack at zero current with full cooling so the hot cell soaks back below the limit before any load is restored.',
        },
      ],
    });
  }

  // ── 6. CELL IMBALANCE (state-of-charge spread: independent of load IR drop) ──
  let hiCell = cells[0];
  let loCell = cells[0];
  for (const c of cells) {
    if (!hiCell || c.soc > hiCell.soc) hiCell = c;
    if (!loCell || c.soc < loCell.soc) loCell = c;
  }
  const socSpread = hiCell && loCell ? hiCell.soc - loCell.soc : 0;
  if (socSpread > 6) {
    const critical = socSpread > 12;
    alarms.push({
      key: 'imbalance',
      severity: critical ? 'critical' : 'warning',
      title: critical ? 'SEVERE CELL IMBALANCE — ANSI 60' : 'CELL IMBALANCE — ANSI 60 PRE-ALARM',
      detail: `Cell state-of-charge spread is ${socSpread.toFixed(1)}% (highest #${hiCell.id} at ${hiCell.soc.toFixed(1)}%, lowest #${loCell.id} at ${loCell.soc.toFixed(1)}%; terminal Δ ${t.deltaVoltage.toFixed(0)} mV). The weakest cell will reach its voltage limit before the rest of the string.`,
      cause: 'Cell-to-cell capacity / impedance mismatch, uneven temperature, or balancing has not run recently.',
      risk: 'Usable pack capacity shrinks to the weakest cell and the pack trips on OVP/UVP early; imbalance accelerates with cycling.',
      standard: 'IEC 62619 · IEEE C37.2 fn 60 (voltage balance) · AFE cell-balancing practice',
      cellId: loCell.id,
      measured: `${socSpread.toFixed(1)} % spread`,
      limit: '6% alarm · 12% trip',
      ratio: gauge(socSpread, 6, 12),
      solutions: [
        {
          id: 'start_balance',
          tier: 'auto',
          code: '60-A',
          action: 'BAL MATRIX',
          label: 'Engage balancing matrix to ΔV < 15 mV',
          description: 'Closes the active balancing channels and equalises the string until the spread is under 15 mV, then releases the switches.',
        },
        {
          id: 'balance_and_derate',
          tier: 'trip',
          code: '60-B',
          action: 'BAL+DERATE',
          label: 'Balance + derate load 75%',
          description: 'Runs active balancing while stepping the load command to 25%, so the weak cell cannot reach its limit while the string equalises.',
        },
        {
          id: 'imb_top_balance',
          tier: 'service',
          code: '60-C',
          action: 'TOP-BAL HOLD',
          label: 'Top-balance hold + passive bleed high cell',
          description: 'Holds charge at 1 A while the passive bleed resistor drains the high cell until the string converges, then releases to normal balancing.',
        },
      ],
    });
  }

  // ── 7. LOW STATE OF CHARGE ─────────────────────────────────────────
  if (t.packSoC < 20) {
    const critical = t.packSoC < 10;
    alarms.push({
      key: 'lowsoc',
      severity: critical ? 'critical' : 'warning',
      title: critical ? 'CRITICALLY LOW CHARGE — RESERVE EXHAUSTED' : 'LOW STATE OF CHARGE — RESERVE WARNING',
      detail: `Pack state of charge is ${t.packSoC.toFixed(1)}% (${t.packEnergyRemaining.toFixed(0)} Wh left). ${running && t.packCurrent < 0 ? 'At the present draw the string will hit cutoff soon.' : 'The reserve is nearly exhausted.'}`,
      cause: 'Extended discharge without recharge.',
      risk: 'Loss of supply, deep discharge of the weakest cell, and under-voltage trip.',
      standard: 'IEC 62619 · UL 1973 (state-of-charge management)',
      measured: `${t.packSoC.toFixed(1)} % SoC`,
      limit: '20% alarm · 10% critical',
      ratio: gauge(t.packSoC, 20, 10),
      solutions: [
        {
          id: 'start_charge',
          tier: 'auto',
          code: 'SOC-A',
          action: 'CC/CV CHG',
          label: 'Transfer to charger — CC/CV at 0.5 C',
          description: `Opens the load path and starts a constant-current / constant-voltage charge at ${(0.5 * Math.max(0.1, t.packCapacityTotal)).toFixed(1)} A (0.5 C), tapering at the cell voltage limit.`,
        },
        {
          id: 'soc_open_discharge',
          tier: 'trip',
          code: 'SOC-B',
          action: 'BUS OFF',
          label: 'Isolate bus — protect remaining reserve',
          description: 'Trips the main DC contactors to preserve the last of the reserve; the pack stays safe until a charger is connected.',
        },
        {
          id: 'soc_ship_mode',
          tier: 'service',
          code: 'SOC-C',
          action: 'SHIP MODE',
          label: 'Ship-mode: cap load at 2 A reserve',
          description: 'Limits discharge to a 2 A hotel load to stretch the remaining reserve until a charger is connected.',
        },
      ],
    });
  }

  alarms.sort((a, b) => ORDER[a.key] - ORDER[b.key]);
  return alarms;
}

export function makeAlarmRecord(alarm: Alarm): AlarmRecord {
  return {
    id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key: alarm.key,
    severity: alarm.severity,
    title: alarm.title,
    cellId: alarm.cellId,
    measured: alarm.measured,
    limit: alarm.limit,
    raisedAt: Date.now(),
    resolvedAt: null,
    actionTaken: null,
    outcome: 'pending',
  };
}


/**
 * Scheduled warning — always available, for every cell type.
 * Picks the parameter that is using the largest share of its protection margin right now
 * (using the selected cell type's own limits) and reports it with an industry response.
 */
export function buildScheduledWarning(t: BmsTelemetry, cells: CellData[], spec: ChemistrySpec): Alarm {
  const name = spec.name;
  const { limitA, direction } = currentLimitA(t, spec);
  const absI = Math.abs(t.packCurrent);
  const cRate = absI / Math.max(0.1, t.packCapacityTotal);
  const vb = spec.nominalVoltage / 3.7;

  let hi = cells[0];
  let lo = cells[0];
  for (const c of cells) {
    if (!hi || c.soc > hi.soc) hi = c;
    if (!lo || c.soc < lo.soc) lo = c;
  }
  const spread = hi && lo ? hi.soc - lo.soc : 0;

  const vWindow = Math.max(0.05, spec.maxVoltage - spec.cutoffVoltage);
  const candidates = [
    { id: 'current', use: absI / limitA },
    { id: 'temp', use: (t.maxTemperature - 20) / Math.max(1, spec.tempMax - 20) },
    { id: 'ovp', use: 1 - (spec.maxVoltage - t.maxVoltage) / vWindow },
    { id: 'uvp', use: 1 - (t.minVoltage - spec.cutoffVoltage) / vWindow },
    { id: 'imbalance', use: spread / 12 },
    { id: 'soc', use: (100 - t.packSoC) / 100 },
  ];
  // Only consider risks that apply to the way the pack is being used right now
  const flow = t.packCurrent;
  const relevant = candidates.filter(
    (c) => !(c.id === 'ovp' && flow < -0.05) && !(c.id === 'uvp' && flow > 0.05) && !(c.id === 'soc' && flow > 0.05)
  );
  relevant.sort((a, b) => b.use - a.use);
  const top = relevant[0];
  const pct = Math.max(0, Math.round(top.use * 100));
  const base = {
    key: 'watch' as const,
    severity: 'warning' as const,
    ratio: Math.min(1.3, 0.7 + Math.max(0, top.use) * 0.3),
  };

  switch (top.id) {
    case 'temp':
      return {
        ...base,
        title: 'HIGHEST RISK — CELL TEMPERATURE · ANSI 49',
        detail: `Peak cell #${t.maxTempCellId} (${name}) is at ${t.maxTemperature.toFixed(1)} °C, using ${pct}% of its thermal margin (limit ${spec.tempMax} °C, runaway ${spec.thermalRunawayTemp} °C). Temperature is the parameter closest to its protection limit.`,
        cause: running(t) ? 'I²R heating from the present bus current, limited by the cooling capacity.' : 'Residual heat in the cells and limited cooling.',
        risk: 'Heat accelerates ageing; if it keeps rising the cell can reach thermal runaway.',
        standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 49 (thermal relay)',
        cellId: t.maxTempCellId,
        measured: `${t.maxTemperature.toFixed(1)} °C`,
        limit: `${spec.tempMax} °C`,
        solutions: [
          { id: 'cooling_only', tier: 'auto', code: '49T-A', action: 'FAN 100%', label: 'Thermal fan controller to 100%', description: `Runs the cooling fan at full speed to pull the peak cell well below ${spec.tempMax} °C.` },
          { id: 'cool_and_derate', tier: 'trip', code: '49T-B', action: 'FAN+DERATE', label: 'Fan 100% + derate current 75%', description: 'Full cooling plus a 75% step-down of the current command to cut I²R heat at its source.' },
          { id: 'ot_soak', tier: 'service', code: '49T-C', action: 'THERMAL SOAK', label: 'Thermal soak: idle + fan 100% until cool', description: 'Parks the pack at zero current with full cooling so the hot cell soaks back below the limit.' },
        ],
      };
    case 'ovp':
      return {
        ...base,
        title: 'HIGHEST RISK — CELL VOLTAGE (HIGH) · ANSI 59',
        detail: `Cell #${t.maxVoltageCellId} (${name}) is at ${t.maxVoltage.toFixed(3)} V, using ${pct}% of the voltage window (maximum ${spec.maxVoltage.toFixed(2)} V). It is the cell closest to over-voltage.`,
        cause: 'The highest cell leads the string in state of charge, or the charger regulation is high.',
        risk: 'Charging past the maximum causes electrolyte decomposition, plating and gas generation.',
        standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 59 (overvoltage)',
        cellId: t.maxVoltageCellId,
        measured: `${t.maxVoltage.toFixed(3)} V`,
        limit: `${spec.maxVoltage.toFixed(2)} V max`,
        solutions: [
          { id: 'ovp_drip_balance', tier: 'auto', code: '59-A', action: 'TRICKLE+BAL', label: 'Charger to 2 A trickle + active balance', description: 'Cuts the charger to a 2 A trickle and bleeds the high cell through the balancing matrix.' },
          { id: 'ovp_full_stop', tier: 'trip', code: '59-B', action: 'TRIP CHARGE', label: 'Trip charge contactor + deep balance', description: `Stops charging and balances until every cell is below ${(spec.maxVoltage - 0.05 * vb).toFixed(2)} V.` },
          { id: 'ovp_recalibrate_cv', tier: 'service', code: '59-C', action: 'RECALIBRATE CV', label: 'Recalibrate charger CV −50 mV/cell + verify sense', description: 'Drops the charger to a 1 A hold and verifies the CV setpoint and AFE sense leads.' },
        ],
      };
    case 'uvp':
      return {
        ...base,
        title: 'HIGHEST RISK — CELL VOLTAGE (LOW) · ANSI 27',
        detail: `Cell #${t.minVoltageCellId} (${name}) is at ${t.minVoltage.toFixed(3)} V, using ${pct}% of the voltage window (cutoff ${spec.cutoffVoltage.toFixed(2)} V). It is the cell closest to under-voltage.`,
        cause: 'The weakest cell is deepest in discharge, or load current is pulling it down through its internal resistance.',
        risk: 'Discharging below cutoff dissolves copper and can reverse the cell — permanent damage.',
        standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 27 (undervoltage)',
        cellId: t.minVoltageCellId,
        measured: `${t.minVoltage.toFixed(3)} V`,
        limit: `${spec.cutoffVoltage.toFixed(2)} V min`,
        solutions: [
          { id: 'reduce_load', tier: 'auto', code: '27-A', action: 'SHED LOAD', label: 'Shed 75% of bus load', description: 'Steps the discharge command down to 25% so the weak cell stays above cutoff.' },
          { id: 'uv_open_discharge', tier: 'trip', code: '27-B', action: 'BUS OFF', label: 'Open discharge contactor (bus off)', description: 'Trips the main DC contactors to remove the load and let the string recover.' },
          { id: 'uv_recovery_charge', tier: 'service', code: '27-C', action: 'RECOVERY CHG', label: `Soft-start recovery charge at ${(0.2 * Math.max(0.1, t.packCapacityTotal)).toFixed(1)} A (0.2 C)`, description: 'Applies a gentle 0.2 C recovery charge to lift the weak cell above cutoff.' },
        ],
      };
    case 'imbalance':
      return {
        ...base,
        title: 'HIGHEST RISK — CELL IMBALANCE · ANSI 60',
        detail: `State-of-charge spread is ${spread.toFixed(1)}% (highest #${hi.id} at ${hi.soc.toFixed(1)}%, lowest #${lo.id} at ${lo.soc.toFixed(1)}%) — ${pct}% of the 12% trip spread for ${name}.`,
        cause: 'Cell-to-cell capacity or impedance mismatch; balancing has not equalised the string.',
        risk: 'Usable capacity shrinks to the weakest cell and the pack trips early on over/under-voltage.',
        standard: 'IEC 62619 · IEEE C37.2 fn 60 (voltage balance)',
        cellId: lo.id,
        measured: `${spread.toFixed(1)} % spread`,
        limit: '6% alarm · 12% trip',
        solutions: [
          { id: 'start_balance', tier: 'auto', code: '60-A', action: 'BAL MATRIX', label: 'Engage balancing matrix to ΔV < 15 mV', description: 'Closes the active balancing channels until the string is equalised.' },
          { id: 'balance_and_derate', tier: 'trip', code: '60-B', action: 'BAL+DERATE', label: 'Balance + derate load 75%', description: 'Balances while stepping the load to 25% so the weak cell is not stressed.' },
          { id: 'imb_top_balance', tier: 'service', code: '60-C', action: 'TOP-BAL HOLD', label: 'Top-balance hold + passive bleed high cell', description: 'Holds charge at 1 A while the passive bleed resistor drains the high cell.' },
        ],
      };
    case 'soc':
      return {
        ...base,
        title: 'HIGHEST RISK — STATE OF CHARGE · RESERVE',
        detail: `Pack charge is ${t.packSoC.toFixed(1)}% (${t.packEnergyRemaining.toFixed(0)} Wh left, ${t.packCapacityRemaining.toFixed(2)} Ah). ${name} reserve is being used up.`,
        cause: 'Discharge without recharge.',
        risk: 'Loss of supply and deep discharge of the weakest cell.',
        standard: 'IEC 62619 · UL 1973 (state-of-charge management)',
        measured: `${t.packSoC.toFixed(1)} % SoC`,
        limit: '20% alarm · 10% critical',
        solutions: [
          { id: 'start_charge', tier: 'auto', code: 'SOC-A', action: 'CC/CV CHG', label: 'Transfer to charger — CC/CV at 0.5 C', description: `Starts a constant-current / constant-voltage charge at ${(0.5 * Math.max(0.1, t.packCapacityTotal)).toFixed(1)} A (0.5 C).` },
          { id: 'soc_open_discharge', tier: 'trip', code: 'SOC-B', action: 'BUS OFF', label: 'Isolate bus — protect remaining reserve', description: 'Trips the main contactors to preserve the last of the reserve until a charger is connected.' },
          { id: 'soc_ship_mode', tier: 'service', code: 'SOC-C', action: 'SHIP MODE', label: 'Ship-mode: cap load at 2 A reserve', description: 'Limits discharge to a 2 A hotel load to stretch the reserve.' },
        ],
      };
    default:
      return {
        ...base,
        title: `HIGHEST RISK — BUS CURRENT · ANSI 50/51`,
        detail: `Bus ${direction} current is ${absI.toFixed(1)} A (${cRate.toFixed(2)} C), using ${pct}% of the ${limitA.toFixed(0)} A rating of this ${name} string (${direction === 'discharge' ? spec.maxDischargeC : spec.maxChargeC} C).`,
        cause: direction === 'discharge' ? 'Load / inverter demand on the cells.' : 'Charger current command on the cells.',
        risk: 'Heating of cells and busbars, faster ageing, fuse F1 melt if the rating is exceeded.',
        standard: 'IEC 62619 · UL 1973 · IEEE C37.2 fn 50/51 (overcurrent)',
        measured: `${absI.toFixed(1)} A`,
        limit: `${limitA.toFixed(0)} A rated`,
        solutions: [
          { id: 'throttle_current', tier: 'auto', code: '51-A', action: 'DERATE', label: `Derate ${direction === 'discharge' ? 'converter' : 'charger'} to ${Math.max(1, Math.round(0.7 * limitA))} A`, description: `Steps the current command down to 70% of the ${limitA.toFixed(0)} A rating for full protection margin.` },
          { id: 'oc_trip_k1k2', tier: 'trip', code: '51-B', action: 'TRIP K1/K2', label: 'Trip main contactor K1/K2 (bus off)', description: 'Opens both main DC contactors to zero the bus current and latch the 50/51 trip.' },
          { id: 'oc_staged_restart', tier: 'service', code: '51-C', action: 'STAGED RESTART', label: `Staged restart at 50% (${Math.max(1, Math.round(0.5 * limitA))} A)`, description: 'Re-applies the load in verified stages at half rating to confirm the overload has cleared.' },
        ],
      };
  }
}

function running(t: BmsTelemetry): boolean {
  return Math.abs(t.packCurrent) > 0.05;
}
