import { CellData } from '../../types/battery';

interface DeltaBarChartProps {
  cells: CellData[];
  meanVoltage: number;
  selectedId: number;
  onSelect: (id: number) => void;
}

export function DeltaBarChart({ cells, meanVoltage, selectedId, onSelect }: DeltaBarChartProps) {
  const diffs = cells.map((c) => (c.voltage - meanVoltage) * 1000);
  const rawPeak = Math.max(8, ...diffs.map((d) => Math.abs(d)));
  const peak = Math.max(15, Math.ceil(rawPeak / 5) * 5);

  const width = Math.max(640, cells.length * 56);
  const height = 280;
  const padL = 52;
  const padR = 16;
  const padT = 28;
  const padB = 32;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const zeroY = padT + innerH / 2;
  const slot = innerW / Math.max(1, cells.length);

  const gridVals = [peak, peak / 2, 0, -peak / 2, -peak];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[520px]"
        style={{ height: 280 }}
        role="img"
        aria-label="Cell voltage deviation histogram"
      >
        <rect x="0" y="0" width={width} height={height} fill="#020617" rx="10" />

        {gridVals.map((g) => {
          const y = zeroY - (g / peak) * (innerH / 2);
          return (
            <g key={g}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke={g === 0 ? '#22d3ee' : '#1e293b'}
                strokeWidth={g === 0 ? 1.2 : 1}
                strokeDasharray={g === 0 ? '0' : '4 4'}
                opacity={g === 0 ? 0.7 : 1}
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                fill={g === 0 ? '#67e8f9' : '#94a3b8'}
                fontSize="10"
                fontFamily="ui-monospace, Menlo, monospace"
              >
                {g > 0 ? `+${g.toFixed(0)}` : g.toFixed(0)}
              </text>
            </g>
          );
        })}

        <text x={8} y={16} fill="#64748b" fontSize="9" fontFamily="ui-monospace, Menlo, monospace">
          mV vs mean
        </text>

        {cells.map((cell, i) => {
          const d = diffs[i];
          const barH = Math.max(2, (Math.abs(d) / peak) * (innerH / 2));
          const x = padL + i * slot + slot * 0.18;
          const bw = Math.max(10, slot * 0.64);
          const y = d >= 0 ? zeroY - barH : zeroY;
          const selected = cell.id === selectedId;
          const fill = selected ? '#38bdf8' : d >= 5 ? '#34d399' : d <= -5 ? '#fb7185' : '#64748b';

          return (
            <g
              key={cell.id}
              onClick={() => onSelect(cell.id)}
              style={{ cursor: 'pointer' }}
            >
              {selected && (
                <rect
                  x={x - 3}
                  y={padT}
                  width={bw + 6}
                  height={innerH}
                  fill="#1d4ed8"
                  opacity="0.12"
                  rx="4"
                />
              )}
              <rect x={x} y={y} width={bw} height={barH} fill={fill} rx="3" opacity={selected ? 1 : 0.92} />
              <text
                x={x + bw / 2}
                y={d >= 0 ? y - 6 : y + barH + 12}
                textAnchor="middle"
                fill={fill}
                fontSize="10"
                fontFamily="ui-monospace, Menlo, monospace"
                fontWeight="700"
              >
                {d >= 0 ? `+${d.toFixed(1)}` : d.toFixed(1)}
              </text>
              <text
                x={x + bw / 2}
                y={height - 10}
                textAnchor="middle"
                fill={selected ? '#7dd3fc' : '#94a3b8'}
                fontSize="10"
                fontFamily="ui-monospace, Menlo, monospace"
                fontWeight={selected ? 700 : 400}
              >
                C#{cell.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
