import type { ReactNode } from 'react';
import { BmsTelemetry, CellData, ChemistrySpec } from '../../types/battery';
import { ElectricalState, EnergyCounters, fmtPower, fmtOhm } from '../../utils/electrical';
import { estimateBatteryLife } from '../../utils/batteryLife';
import { Zap, Gauge, Activity, BatteryCharging, Waves, ShieldCheck, ToggleRight, Sigma, Clock3 } from 'lucide-react';

interface KpiStripProps {
  telemetry: BmsTelemetry;
  el: ElectricalState;
  energy: EnergyCounters;
  cells: CellData[];
  spec: ChemistrySpec;
  topology: string;
  onSelectHigh: () => void;
  onSelectLow: () => void;
}

function Tile({
  label,
  value,
  unit,
  sub,
  accent,
  icon,
  onClick,
  alarm,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  accent: string;
  icon: ReactNode;
  onClick?: () => void;
  alarm?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${value}${unit ? ` ${unit}` : ''} — ${sub}`}
      className={`text-left rounded-md px-2 py-1 min-w-0 border bg-[#060c18] ${
        alarm ? 'border-rose-500/70' : 'border-slate-800'
      } ${onClick ? 'cursor-pointer hover:border-slate-600' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between gap-1 text-[8.5px] uppercase tracking-[0.1em] text-slate-500 font-bold leading-none">
        <span className="truncate">{label}</span>
        <span className={`${accent} shrink-0 [&>svg]:w-2.5 [&>svg]:h-2.5`}>{icon}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-0.5 font-mono tabular-nums leading-tight min-w-0">
        <span className={`text-[13px] font-bold tracking-tight truncate ${accent}`}>{value}</span>
        {unit && <span className="text-[9px] text-slate-500 shrink-0">{unit}</span>}
      </div>
      <div className="text-[8.5px] text-slate-500 font-mono truncate leading-tight">{sub}</div>
    </button>
  );
}

export function KpiStrip({ telemetry: t, el, energy, cells, spec, topology, onSelectHigh, onSelectLow }: KpiStripProps) {
  const p = fmtPower(el.powerW);
  const life = estimateBatteryLife(t, cells, spec);
  const charging = el.current > 0.1;
  const discharging = el.current < -0.1;
  const contactorColor =
    el.contactor === 'closed'
      ? 'text-emerald-400'
      : el.contactor === 'precharge'
      ? 'text-amber-400'
      : el.contactor === 'tripped'
      ? 'text-rose-400'
      : 'text-slate-400';

  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))' }}>
      <Tile
        label="Pack voltage"
        value={t.packVoltage.toFixed(2)}
        unit="V"
        sub={`Link ${el.linkVoltage.toFixed(2)} V · ${topology}`}
        accent="text-white"
        icon={<Zap className="w-3.5 h-3.5" />}
      />
      <Tile
        label="Shunt current"
        value={`${el.current > 0 ? '+' : ''}${el.current.toFixed(2)}`}
        unit="A"
        sub={`${charging ? 'Charge' : discharging ? 'Discharge' : 'No flow'} · ${el.cRate.toFixed(2)} C`}
        accent={charging ? 'text-cyan-300' : discharging ? 'text-amber-300' : 'text-slate-300'}
        icon={<Gauge className="w-3.5 h-3.5" />}
        alarm={!el.fuseOk}
      />
      <Tile
        label="Power"
        value={p.value}
        unit={p.unit}
        sub={`I²R ${el.ohmicLossW.toFixed(1)} W · η ${el.efficiencyPct.toFixed(1)}%`}
        accent="text-violet-300"
        icon={<Activity className="w-3.5 h-3.5" />}
      />
      <Tile
        label="Energy out / in"
        value={energy.whOut.toFixed(1)}
        unit={`/ ${energy.whIn.toFixed(1)} Wh`}
        sub={`${energy.ahOut.toFixed(3)} Ah out · ${energy.ahIn.toFixed(3)} in`}
        accent="text-emerald-300"
        icon={<BatteryCharging className="w-3.5 h-3.5" />}
      />
      <Tile
        label="Battery life"
        value={life.runtimeText}
        sub={`${life.runtimeContext} · SoH ${life.minimumSoh.toFixed(0)}%`}
        accent="text-cyan-300"
        icon={<Clock3 className="w-3.5 h-3.5" />}
      />
      <Tile
        label="Cell ΔV"
        value={t.deltaVoltage.toFixed(1)}
        unit="mV"
        sub={`Hi CH${t.maxVoltageCellId} ${t.maxVoltage.toFixed(3)} · Lo CH${t.minVoltageCellId}`}
        accent={t.deltaVoltage > 60 ? 'text-rose-400' : t.deltaVoltage > 25 ? 'text-amber-400' : 'text-emerald-400'}
        icon={<Waves className="w-3.5 h-3.5" />}
        onClick={t.deltaVoltage > 0 ? onSelectHigh : onSelectLow}
        alarm={t.deltaVoltage > 60}
      />
      <Tile
        label="Pack resistance"
        value={el.packResistanceMohm.toFixed(1)}
        unit="mΩ"
        sub={`Busbar drop ${el.busbarDropMv.toFixed(0)} mV`}
        accent="text-sky-300"
        icon={<Sigma className="w-3.5 h-3.5" />}
      />
      <Tile
        label="Insulation"
        value={fmtOhm(el.isolationKohm)}
        sub={`Limit ${el.isolationLimitKohm.toFixed(1)} kΩ (500 Ω/V)`}
        accent={el.isolationOk ? 'text-emerald-400' : 'text-rose-400'}
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        alarm={!el.isolationOk}
      />
      <Tile
        label="Contactors"
        value={el.contactor.toUpperCase()}
        sub={`K1 ${el.k1MainPos ? 'ON' : 'off'} · K2 ${el.k2MainNeg ? 'ON' : 'off'} · K3 ${el.k3Precharge ? 'ON' : 'off'}`}
        accent={contactorColor}
        icon={<ToggleRight className="w-3.5 h-3.5" />}
        alarm={el.contactor === 'tripped'}
      />
    </div>
  );
}
