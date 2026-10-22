import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, GitCompareArrows } from 'lucide-react';
import { BATTERY_CHEMISTRIES } from './batteryChemistryData';
import type { BatteryChemistryType, ChemistrySpec } from './battery';

const models = Object.values(BATTERY_CHEMISTRIES);
const cautions: Record<BatteryChemistryType, string> = {
  'li-ion': 'Strong energy density for mobile packs. Requires cell balancing, overcharge protection, and careful thermal management.',
  lipo: 'High discharge capability and flexible packaging suit drones. Protect pouches from puncture, swelling, and overcharging.',
  lifepo4: 'Long cycle life and thermal stability suit stationary storage. Lower cell voltage requires more series cells for a given bus.',
  nimh: 'Proven aqueous chemistry for robust rechargeable packs. Use temperature and negative delta-V charge termination, not lithium CC/CV limits.',
  'lead-acid': 'Low initial cost suits backup power. High mass, limited deep-cycle life, and ventilation requirements affect installation.',
  'solid-state': 'An emerging family with potential energy-density gains. The simulator uses a representative target model; interfaces, pressure requirements, safety, and commercial maturity vary by design.',
};
type Row = { label: string; value: (s: ChemistrySpec) => ReactNode };
const sections: { title: string; rows: Row[] }[] = [
  { title: 'Electrical performance', rows: [
    { label: 'Nominal / charge ceiling / cutoff', value: s => `${s.nominalVoltage.toFixed(2)} / ${s.maxVoltage.toFixed(2)} / ${s.cutoffVoltage.toFixed(2)} V` },
    { label: 'Representative cell capacity', value: s => `${s.typicalCapacity.toLocaleString()} mAh` },
    { label: 'Nominal cell energy', value: s => `${(s.nominalVoltage * s.typicalCapacity / 1000).toFixed(2)} Wh` },
    { label: 'Internal resistance', value: s => `${s.typicalIR} mΩ` },
    { label: 'Maximum discharge / charge rate', value: s => `${s.maxDischargeC}C / ${s.maxChargeC}C` },
    { label: 'Calculated discharge / charge current', value: s => `${(s.maxDischargeC * s.typicalCapacity / 1000).toFixed(1)} / ${(s.maxChargeC * s.typicalCapacity / 1000).toFixed(1)} A` },
  ]},
  { title: 'Life, mass, temperature & cost', rows: [
    { label: 'Specific energy', value: s => `${s.energyDensity} Wh/kg` },
    { label: 'Cell mass inferred from specific energy', value: s => `${(s.nominalVoltage * s.typicalCapacity / s.energyDensity).toFixed(1)} g` },
    { label: 'Typical cycle life', value: s => `${s.cycleLife.toLocaleString()} cycles` },
    { label: 'Model operating temperature range', value: s => `${s.tempMin} to ${s.tempMax} °C` },
    { label: 'Model thermal alarm reference', value: s => `${s.thermalRunawayTemp} °C` },
    { label: 'Simulator safety category / relative cost', value: s => `${s.safetyRating} / ${s.costTier}` },
  ]},
  { title: 'Chemistry & construction', rows: [
    { label: 'Model definition', value: s => s.fullName },
    { label: 'Cell format', value: s => s.formFactorName },
    { label: 'Cathode', value: s => s.cathodeMaterial },
    { label: 'Anode', value: s => s.anodeMaterial },
    { label: 'Electrolyte', value: s => s.electrolyteType },
    { label: 'Separator', value: s => s.separatorType },
    { label: 'Housing', value: s => s.housingMaterial },
    { label: 'Charge reaction (model schematic)', value: s => s.chemicalReaction.charge },
    { label: 'Discharge reaction (model schematic)', value: s => s.chemicalReaction.discharge },
    { label: 'Common applications', value: s => s.primaryApplications.join(' · ') },
    { label: 'Model features', value: s => <ul className="space-y-2">{s.features.map(f => <li key={f}>• {f}</li>)}</ul> },
    { label: 'Selection considerations', value: s => cautions[s.id] },
  ]},
];
export function BatteryCompareView() {
  const [left, setLeft] = useState<BatteryChemistryType>('li-ion');
  const [right, setRight] = useState<BatteryChemistryType>('lifepo4');
  const a = BATTERY_CHEMISTRIES[left], b = BATTERY_CHEMISTRIES[right];
  function choose(side: 'left' | 'right', id: BatteryChemistryType) {
    if (side === 'left') { if (id === right) setRight(left); setLeft(id); }
    else { if (id === left) setLeft(right); setRight(id); }
  }
  const ratio = (a.energyDensity / b.energyDensity).toFixed(2);
  return <section className="space-y-5">
    <div className="flex items-center gap-2 text-cyan-300 text-xs uppercase tracking-widest"><GitCompareArrows size={20} />Model comparison</div>
    <h2 className="text-2xl font-bold text-white">Two chemistries. Every tradeoff.</h2>
    <p className="text-sm text-slate-400 max-w-3xl">Compare representative cell models from this simulator. Values describe different cell formats and capacities; they are illustrative model assumptions, not universal chemistry ratings or manufacturer specifications.</p>
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
      {(['left', 'right'] as const).map((side, i) => <div key={side} className={i ? 'contents' : ''}>
        {i === 1 && <button title="Swap models" aria-label="Swap comparison models" onClick={() => { setLeft(right); setRight(left); }} className="p-2 mb-0.5 rounded-lg border border-slate-700 hover:bg-slate-800"><ArrowLeftRight size={18} /></button>}
        <label className="block min-w-0 text-xs text-slate-400">{side === 'left' ? 'Model A' : 'Model B'}<select value={side === 'left' ? left : right} onChange={e => choose(side, e.target.value as BatteryChemistryType)} className="block w-full mt-2 bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white">{models.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>)}
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="p-4 border border-cyan-900 bg-cyan-950/20 rounded-xl"><p className="text-xs text-cyan-300 uppercase tracking-wider">Energy per mass</p><p className="text-xl font-mono text-white mt-2">{ratio}×</p><p className="text-xs text-slate-400 mt-2">{a.name} relative to {b.name}, using model Wh/kg.</p></div>
      <div className="p-4 border border-slate-700 bg-slate-900 rounded-xl"><p className="text-xs text-slate-400 uppercase tracking-wider">Cycle-life difference</p><p className="text-xl font-mono text-white mt-2">{(a.cycleLife - b.cycleLife).toLocaleString()} cycles</p><p className="text-xs text-slate-400 mt-2">{a.name} minus {b.name}. Actual life depends on depth of discharge, temperature, and rate.</p></div>
    </div>
    <div className="overflow-x-auto border border-slate-800 rounded-xl">
      <table className="w-full min-w-[580px] text-xs text-left table-fixed">
        <thead className="bg-slate-900 text-white"><tr><th scope="col" className="p-4 w-[28%]">Parameter</th><th scope="col" className="p-4 text-cyan-300">{a.name}</th><th scope="col" className="p-4 text-amber-300">{b.name}</th></tr></thead>
        <tbody>{sections.map(section => <Section key={section.title} section={section} a={a} b={b} />)}</tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">Thermal references and safety categories are simulator labels, not certifications. Temperature ranges are not permission to charge across the whole range. Follow the actual cell datasheet. Solid-state values describe an emerging representative model.</p>
  </section>;
}
function Section({ section, a, b }: { section: typeof sections[number]; a: ChemistrySpec; b: ChemistrySpec }) {
  return <><tr><th colSpan={3} className="p-3 bg-slate-800/60 text-[10px] tracking-widest uppercase text-slate-300">{section.title}</th></tr>{section.rows.map(row => <tr key={row.label} className="border-t border-slate-800 align-top"><th scope="row" className="p-4 text-slate-400 font-medium">{row.label}</th><td className="p-4 text-slate-200 break-words">{row.value(a)}</td><td className="p-4 text-slate-200 break-words">{row.value(b)}</td></tr>)}</>;
}
