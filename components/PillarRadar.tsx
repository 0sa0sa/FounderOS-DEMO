import type { PillarAxis } from '@/lib/pillar-radar';

/**
 * The pillar spider chart (FounderOS-style): one axis per department, a
 * white polygon plotting each pillar's live health score over a three-level
 * hex grid, mono uppercase labels around the rim, and the doctor health line
 * underneath. Pure SVG server component — no animation loop.
 */

const S = 520; // viewBox square
const C = S / 2;
const R = 172; // outer grid radius
const LABEL_R = R + 44;

function point(axisIndex: number, count: number, radius: number): [number, number] {
  const a = (axisIndex / count) * 2 * Math.PI - Math.PI / 2; // first axis at top
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

export function PillarRadar({
  axes, health, warnings,
}: {
  axes: PillarAxis[];
  health: number | null;
  warnings: number;
}) {
  const n = Math.max(1, axes.length);
  const gridLevels = [1 / 3, 2 / 3, 1];
  const ring = (k: number) =>
    Array.from({ length: n }, (_, i) => point(i, n, R * k).join(',')).join(' ');
  const poly = axes
    .map((a, i) => point(i, n, (Math.max(5, a.score) / 100) * R).join(','))
    .join(' ');

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 place-items-center">
        <svg viewBox={`0 0 ${S} ${S}`} className="block w-full max-w-[500px]" role="img" aria-label="Pillar health radar">
          {/* three-level hex grid + spokes */}
          {gridLevels.map((k) => (
            <polygon key={k} points={ring(k)} fill={k === 1 ? 'none' : 'none'} stroke="var(--border-strong)" strokeWidth={1} opacity={k === 1 ? 0.9 : 0.5} />
          ))}
          {axes.map((a, i) => {
            const [x, y] = point(i, n, R);
            return <line key={a.id} x1={C} y1={C} x2={x} y2={y} stroke="var(--border-strong)" strokeWidth={1} opacity={0.4} />;
          })}

          {/* the health polygon — white, filled faint, dotted vertices */}
          <polygon points={poly} fill="var(--text)" fillOpacity={0.07} stroke="var(--text)" strokeWidth={2.4} strokeLinejoin="round" />
          {axes.map((a, i) => {
            const [x, y] = point(i, n, (Math.max(5, a.score) / 100) * R);
            return <circle key={a.id} cx={x} cy={y} r={5} fill="var(--text)" />;
          })}

          {/* pillar labels around the rim */}
          {axes.map((a, i) => {
            const [x, y] = point(i, n, LABEL_R);
            const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end';
            return (
              <text
                key={a.id}
                x={x}
                y={y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontFamily="var(--font-mono)"
                fontSize={15}
                letterSpacing="0.28em"
                fill="var(--text-3)"
              >
                {a.label.toUpperCase().replace('/GROWTH', '')}
              </text>
            );
          })}
        </svg>
      </div>

      {/* the doctor line, same numbers as the monitor beside it */}
      <div className="flex items-baseline justify-center gap-2 pb-4 font-mono">
        <span className="text-2xl font-semibold text-os-ok">{health ?? '—'}</span>
        <span className="text-[11px] text-os-dim">/ 100 health</span>
        {warnings > 0 && (
          <>
            <span className="text-os-border-strong">·</span>
            <span className="text-[11px] font-semibold text-os-warn">
              {warnings} warning{warnings === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
