import { ElectricalState } from '../../utils/electrical';
import { SimulationMode } from '../../types/battery';

interface Props {
  el: ElectricalState;
  mode: SimulationMode;
  topology: string;
  cellType: string;
  soc: number;
}

const C = {
  wire: '#334155',
  live: '#22d3ee',
  neg: '#60a5fa',
  closed: '#22c55e',
  open: '#64748b',
  trip: '#ef4444',
  pre: '#f59e0b',
  text: '#cbd5e1',
  dim: '#64748b',
};

function Contactor({ x, y, closed, color, label, sub }: { x: number; y: number; closed: boolean; color: string; label: string; sub: string }) {
  // terminals at x and x+40 on rail y
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} />
      <circle cx={x + 40} cy={y} r={3.5} fill={color} />
      <line
        x1={x}
        y1={y}
        x2={closed ? x + 40 : x + 34}
        y2={closed ? y : y - 18}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <rect x={x + 6} y={y + 10} width={28} height={12} rx={2} fill="none" stroke={color} strokeWidth={1} opacity={0.7} />
      <text x={x + 20} y={y + 19} textAnchor="middle" fontSize={7} fill={color} fontFamily="ui-monospace,monospace">
        coil
      </text>
      <text x={x + 20} y={y - 24} textAnchor="middle" fontSize={10} fontWeight={700} fill={C.text} fontFamily="ui-monospace,monospace">
        {label}
      </text>
      <text x={x + 20} y={y + 34} textAnchor="middle" fontSize={8.5} fill={color} fontFamily="ui-monospace,monospace" fontWeight={700}>
        {sub}
      </text>
    </g>
  );
}

function Resistor({ x, y, w, color }: { x: number; y: number; w: number; color: string }) {
  const seg = w / 8;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < 8; i++) d += ` L ${x + seg * (i + 0.5)} ${y + (i % 2 === 0 ? -6 : 6)}`;
  d += ` L ${x + w} ${y}`;
  return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />;
}

export function SingleLineDiagram({ el, mode, topology, cellType, soc }: Props) {
  const TOP = 120;
  const BOT = 250;
  const flowing = el.contactor === 'closed' && Math.abs(el.current) > 0.15;
  const charging = el.current > 0;
  const kColor = el.contactor === 'tripped' ? C.trip : el.contactor === 'closed' ? C.closed : C.open;
  const k3Color = el.k3Precharge ? C.pre : C.open;
  const k2Color = el.contactor === 'tripped' ? C.trip : el.k2MainNeg ? C.closed : C.open;
  const busColor = el.linkVoltage > 1 ? (el.contactor === 'precharge' ? C.pre : C.live) : C.wire;
  const flowClass = charging ? 'sld-flow-rev' : 'sld-flow';
  const loadActive = flowing && !charging;
  const chargerActive = flowing && charging;
  const speed = Math.max(0.35, 1.6 - Math.min(1.25, Math.abs(el.current) / 40));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 0 1000 330" className="w-full min-w-[760px]" style={{ height: 330 }} role="img" aria-label="Single line diagram">
        <defs>
          <pattern id="sldgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0f1b2d" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="1000" height="330" fill="#050a14" />
        <rect x="0" y="0" width="1000" height="330" fill="url(#sldgrid)" />

        {/* ---------- BATTERY STRING ---------- */}
        <rect x="24" y="92" width="150" height="186" rx="8" fill="#0b1324" stroke="#1e3a5f" strokeWidth="1.5" />
        <text x="99" y="112" textAnchor="middle" fontSize="10" fontWeight={700} fill={C.text} fontFamily="ui-monospace,monospace">
          BATTERY STRING
        </text>
        {/* cell symbols */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line x1={52 + i * 26} y1={132} x2={52 + i * 26} y2={156} stroke="#e2e8f0" strokeWidth={2.5} />
            <line x1={60 + i * 26} y1={138} x2={60 + i * 26} y2={150} stroke="#e2e8f0" strokeWidth={4} />
          </g>
        ))}
        <text x="99" y="178" textAnchor="middle" fontSize="9" fill={C.dim} fontFamily="ui-monospace,monospace">
          {topology} · {cellType}
        </text>
        <text x="99" y="204" textAnchor="middle" fontSize="20" fontWeight={800} fill="#ffffff" fontFamily="ui-monospace,monospace">
          {el.packVoltage.toFixed(2)} V
        </text>
        <rect x="44" y="216" width="110" height="7" rx="3.5" fill="#1e293b" />
        <rect x="44" y="216" width={Math.max(2, (110 * soc) / 100)} height="7" rx="3.5" fill="#22d3ee" />
        <text x="99" y="240" textAnchor="middle" fontSize="9" fill={C.dim} fontFamily="ui-monospace,monospace">
          SoC {soc.toFixed(1)} % · R {el.packResistanceMohm.toFixed(1)} mΩ
        </text>
        <text x="182" y={TOP - 4} fontSize="11" fontWeight={800} fill="#f87171" fontFamily="ui-monospace,monospace">+</text>
        <text x="182" y={BOT + 14} fontSize="12" fontWeight={800} fill="#60a5fa" fontFamily="ui-monospace,monospace">−</text>

        {/* ---------- POSITIVE RAIL ---------- */}
        <line x1="174" y1={TOP} x2="232" y2={TOP} stroke={C.live} strokeWidth="3" />
        {/* Fuse F1 */}
        <rect x="232" y={TOP - 9} width="54" height="18" rx="3" fill="#0b1324" stroke={el.fuseOk ? '#94a3b8' : C.trip} strokeWidth="1.5" />
        <line x1="236" y1={TOP} x2="282" y2={TOP} stroke={el.fuseOk ? '#94a3b8' : C.trip} strokeWidth="1.5" strokeDasharray={el.fuseOk ? '0' : '4 3'} />
        <text x="259" y={TOP - 16} textAnchor="middle" fontSize="10" fontWeight={700} fill={C.text} fontFamily="ui-monospace,monospace">F1</text>
        <text x="259" y={TOP + 26} textAnchor="middle" fontSize="8.5" fill={el.fuseLoadPct > 80 ? C.pre : C.dim} fontFamily="ui-monospace,monospace">
          {el.fuseRatingA} A · {el.fuseLoadPct.toFixed(0)}%
        </text>
        <line x1="286" y1={TOP} x2="380" y2={TOP} stroke={C.live} strokeWidth="3" />

        {/* Precharge branch (K3 + R_pre) in parallel with K1 */}
        <line x1="340" y1={TOP} x2="340" y2="52" stroke={el.k3Precharge ? C.pre : C.wire} strokeWidth="2" />
        <line x1="340" y1="52" x2="356" y2="52" stroke={el.k3Precharge ? C.pre : C.wire} strokeWidth="2" />
        <Contactor x={356} y={52} closed={el.k3Precharge} color={k3Color} label="K3 PRE" sub={el.k3Precharge ? `${el.prechargePct.toFixed(0)}%` : 'OPEN'} />
        <line x1="396" y1="52" x2="420" y2="52" stroke={el.k3Precharge ? C.pre : C.wire} strokeWidth="2" />
        <Resistor x={420} y={52} w={48} color={el.k3Precharge ? C.pre : '#475569'} />
        <text x="444" y="36" textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily="ui-monospace,monospace">
          R {el.prechargeResistorOhm} Ω
        </text>
        <line x1="468" y1="52" x2="480" y2="52" stroke={el.k3Precharge ? C.pre : C.wire} strokeWidth="2" />
        <line x1="480" y1="52" x2="480" y2={TOP} stroke={el.k3Precharge ? C.pre : C.wire} strokeWidth="2" />

        {/* K1 main + */}
        <Contactor x={380} y={TOP} closed={el.k1MainPos} color={kColor} label="K1 MAIN+" sub={el.contactor === 'tripped' ? 'TRIP' : el.k1MainPos ? 'CLOSED' : 'OPEN'} />
        <line x1="420" y1={TOP} x2="960" y2={TOP} stroke={busColor} strokeWidth="3" />

        {/* ---------- NEGATIVE RAIL ---------- */}
        <line x1="174" y1={BOT} x2="232" y2={BOT} stroke={C.neg} strokeWidth="3" />
        {/* Shunt */}
        <rect x="232" y={BOT - 9} width="54" height="18" rx="2" fill="#0b1324" stroke="#a78bfa" strokeWidth="1.5" />
        <Resistor x={238} y={BOT} w={42} color="#a78bfa" />
        <line x1="240" y1={BOT - 9} x2="240" y2={BOT - 22} stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="278" y1={BOT - 9} x2="278" y2={BOT - 22} stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 2" />
        <text x="259" y={BOT - 27} textAnchor="middle" fontSize="10" fontWeight={700} fill={C.text} fontFamily="ui-monospace,monospace">SHUNT</text>
        <text x="259" y={BOT + 24} textAnchor="middle" fontSize="8.5" fill="#c4b5fd" fontFamily="ui-monospace,monospace">
          {el.shuntMicroOhm} µΩ · {el.shuntMv.toFixed(2)} mV
        </text>
        <line x1="286" y1={BOT} x2="380" y2={BOT} stroke={C.neg} strokeWidth="3" />
        <Contactor x={380} y={BOT} closed={el.k2MainNeg} color={k2Color} label="K2 MAIN−" sub={el.contactor === 'tripped' ? 'TRIP' : el.k2MainNeg ? 'CLOSED' : 'OPEN'} />
        <line x1="420" y1={BOT} x2="960" y2={BOT} stroke={el.linkVoltage > 1 ? C.neg : C.wire} strokeWidth="3" />

        {/* ---------- DC LINK CAPACITOR ---------- */}
        <line x1="560" y1={TOP} x2="560" y2="176" stroke={busColor} strokeWidth="2" />
        <line x1="540" y1="176" x2="580" y2="176" stroke={busColor} strokeWidth="3" />
        <path d="M 540 190 Q 560 182 580 190" fill="none" stroke={busColor} strokeWidth="3" />
        <line x1="560" y1="188" x2="560" y2={BOT} stroke={el.linkVoltage > 1 ? C.neg : C.wire} strokeWidth="2" />
        <text x="590" y="172" fontSize="9" fill={C.dim} fontFamily="ui-monospace,monospace">C-link {el.linkCapacitanceUf} µF</text>
        <rect x="586" y="178" width="98" height="26" rx="4" fill="#0b1324" stroke={busColor} strokeWidth="1" />
        <text x="635" y="196" textAnchor="middle" fontSize="13" fontWeight={800} fill={el.linkVoltage > 1 ? '#e0f2fe' : C.dim} fontFamily="ui-monospace,monospace">
          {el.linkVoltage.toFixed(2)} V
        </text>
        <text x="635" y="218" textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily="ui-monospace,monospace">DC-LINK</text>

        {/* ---------- LOAD / INVERTER ---------- */}
        <line x1="760" y1={TOP} x2="760" y2="152" stroke={busColor} strokeWidth="2" />
        <rect x="716" y="152" width="88" height="66" rx="6" fill={loadActive ? '#0c2a1c' : '#0b1324'} stroke={loadActive ? C.closed : '#334155'} strokeWidth="1.5" />
        <text x="760" y="174" textAnchor="middle" fontSize="10" fontWeight={700} fill={loadActive ? '#86efac' : C.text} fontFamily="ui-monospace,monospace">LOAD</text>
        <text x="760" y="188" textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily="ui-monospace,monospace">INVERTER</text>
        <text x="760" y="206" textAnchor="middle" fontSize="10" fontWeight={700} fill={loadActive ? '#4ade80' : C.dim} fontFamily="ui-monospace,monospace">
          {loadActive ? `${Math.abs(el.powerW).toFixed(0)} W` : 'IDLE'}
        </text>
        <line x1="760" y1="218" x2="760" y2={BOT} stroke={el.linkVoltage > 1 ? C.neg : C.wire} strokeWidth="2" />

        {/* ---------- CHARGER ---------- */}
        <line x1="900" y1={TOP} x2="900" y2="152" stroke={busColor} strokeWidth="2" />
        <rect x="856" y="152" width="88" height="66" rx="6" fill={chargerActive ? '#0b2233' : '#0b1324'} stroke={chargerActive ? C.live : '#334155'} strokeWidth="1.5" />
        <text x="900" y="174" textAnchor="middle" fontSize="10" fontWeight={700} fill={chargerActive ? '#67e8f9' : C.text} fontFamily="ui-monospace,monospace">CHARGER</text>
        <text x="900" y="188" textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily="ui-monospace,monospace">CC / CV</text>
        <text x="900" y="206" textAnchor="middle" fontSize="10" fontWeight={700} fill={chargerActive ? '#22d3ee' : C.dim} fontFamily="ui-monospace,monospace">
          {chargerActive ? `${el.powerW.toFixed(0)} W` : mode === 'charging_cccv' ? 'STANDBY' : 'OFF'}
        </text>
        <line x1="900" y1="218" x2="900" y2={BOT} stroke={el.linkVoltage > 1 ? C.neg : C.wire} strokeWidth="2" />

        {/* ---------- CURRENT FLOW ANIMATION ---------- */}
        {flowing && (
          <g style={{ animationDuration: `${speed}s` }}>
            <path
              d={`M 174 ${TOP} L ${charging ? 900 : 760} ${TOP}`}
              stroke="#ecfeff"
              strokeWidth="2"
              strokeDasharray="4 14"
              fill="none"
              className={flowClass}
              style={{ animationDuration: `${speed}s` }}
            />
            <path
              d={`M ${charging ? 900 : 760} ${BOT} L 174 ${BOT}`}
              stroke="#dbeafe"
              strokeWidth="2"
              strokeDasharray="4 14"
              fill="none"
              className={flowClass}
              style={{ animationDuration: `${speed}s` }}
            />
          </g>
        )}

        {/* Current readout arrow */}
        <rect x="430" y={TOP - 38} width="112" height="24" rx="4" fill="#0b1324" stroke={flowing ? (charging ? C.live : C.closed) : '#334155'} />
        <text x="486" y={TOP - 21} textAnchor="middle" fontSize="12" fontWeight={800} fill={flowing ? '#f8fafc' : C.dim} fontFamily="ui-monospace,monospace">
          {flowing ? `${charging ? '◄' : '►'} ${Math.abs(el.current).toFixed(2)} A` : '0.00 A'}
        </text>

        {/* ---------- IMD (insulation monitor) ---------- */}
        <rect x="440" y="276" width="190" height="40" rx="6" fill="#0b1324" stroke={el.isolationOk ? '#334155' : C.trip} strokeWidth="1.5" />
        <text x="452" y="292" fontSize="9" fontWeight={700} fill={C.text} fontFamily="ui-monospace,monospace">IMD · R_iso</text>
        <text x="452" y="308" fontSize="12" fontWeight={800} fill={el.isolationOk ? '#4ade80' : '#f87171'} fontFamily="ui-monospace,monospace">
          {el.isolationKohm >= 1000 ? `${(el.isolationKohm / 1000).toFixed(2)} MΩ` : `${el.isolationKohm.toFixed(0)} kΩ`}
        </text>
        <text x="620" y="308" textAnchor="end" fontSize="8.5" fill={C.dim} fontFamily="ui-monospace,monospace">
          min {el.isolationLimitKohm.toFixed(1)} kΩ
        </text>
        <line x1="535" y1="276" x2="535" y2={BOT + 2} stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
        {/* chassis ground */}
        <line x1="652" y1="296" x2="680" y2="296" stroke="#475569" strokeWidth="1" />
        <line x1="680" y1="288" x2="680" y2="304" stroke="#94a3b8" strokeWidth="2" />
        <line x1="685" y1="291" x2="685" y2="301" stroke="#94a3b8" strokeWidth="2" />
        <line x1="690" y1="294" x2="690" y2="298" stroke="#94a3b8" strokeWidth="2" />
        <line x1="630" y1="296" x2="652" y2="296" stroke="#475569" strokeWidth="1" />
        <text x="700" y="300" fontSize="8.5" fill={C.dim} fontFamily="ui-monospace,monospace">CHASSIS</text>

        {/* Sequence status */}
        <rect x="24" y="16" width="290" height="26" rx="5" fill="#0b1324" stroke="#1e293b" />
        <circle cx="40" cy="29" r="5" fill={el.contactor === 'closed' ? C.closed : el.contactor === 'precharge' ? C.pre : el.contactor === 'tripped' ? C.trip : C.open} />
        <text x="52" y="33" fontSize="10" fontWeight={700} fill={C.text} fontFamily="ui-monospace,monospace">
          {el.contactor === 'closed'
            ? 'HV ENABLED · CONTACTORS CLOSED'
            : el.contactor === 'precharge'
            ? `PRECHARGING DC-LINK · ${el.prechargePct.toFixed(0)}%`
            : el.contactor === 'tripped'
            ? 'PROTECTION TRIP · HV ISOLATED'
            : 'HV DISABLED · CONTACTORS OPEN'}
        </text>
      </svg>
    </div>
  );
}
