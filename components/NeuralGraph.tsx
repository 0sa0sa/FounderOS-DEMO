'use client';

import { useMemo, useState } from 'react';
import type { Agent, AgentRun, Department, Person, SopTask } from '@/lib/schemas';
import type { KnowledgeGraph as KGData } from '@/lib/knowledge-graph';
import { neuralLayout, NEURAL_H, NEURAL_W, type NeuralStrand } from '@/lib/neural-layout';
import { NeuralDetail } from '@/components/NeuralDetail';

/**
 * The horizontal "neural network" view of the SAME knowledge graph: tools as
 * the labeled input layer, then workers → SOP tasks → pillars → the Notes
 * core as the single output neuron. Deep navy canvas, thousands of silky
 * signed strands (green positive / red negative, opacity by magnitude, cheap
 * two-pass bloom), floating terminal layer-cards with a clickable activation,
 * and a hover spotlight that zooms the camera onto whatever the cursor is on
 * while everything else dims. Pure SVG — no physics loop, no rAF.
 */

const NAVY_BG = '#0a1024';
const POS_COLOR = '#5ee8a2';
const NEG_COLOR = '#ff5f6b';
const DOT_COLOR = '#e8ecf9';
const ACTIVATIONS = ['ReLU', 'GELU', 'tanh', 'sigmoid', 'softmax'] as const;

// idle shimmer: three strand groups breathing out of phase (same trick as the
// vault layers — group-level animations, never per-strand)
const SHIMMER: React.CSSProperties[] = [
  { animation: 'ng-shimmer 7s ease-in-out infinite alternate' },
  { animation: 'ng-shimmer 9s ease-in-out -3s infinite alternate' },
  { animation: 'ng-shimmer 11s ease-in-out -6s infinite alternate' },
];

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** tiny deterministic sparkline next to each input label */
const sparkPts = (id: string, x: number, y: number) => {
  const h = hashStr(id);
  return Array.from({ length: 5 }, (_, i) => `${x + i * 3},${y - (((h >> (i * 4)) % 7) - 3)}`).join(' ');
};

export function NeuralGraph({
  graph, agents = [], departments = [], people = [], tasks = [], runsByAgent = {},
}: {
  graph: KGData;
  agents?: Agent[];
  departments?: Department[];
  people?: Person[];
  tasks?: SopTask[];
  runsByAgent?: Record<string, AgentRun>;
}) {
  const { layers, pos, strands, reports } = useMemo(() => neuralLayout(graph), [graph]);
  const labelById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.label])), [graph]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acts, setActs] = useState<number[]>(() => layers.map((_, i) => i % ACTIVATIONS.length));

  // the hovered node's layer card morphs to show ITS values instead of the
  // generic layer info — "the top values edit as you look at each piece"
  const hoverLayerIndex = hoverId ? layers.findIndex((l) => l.nodeIds.includes(hoverId)) : -1;
  const hoverSub = useMemo(() => {
    if (!hoverId) return null;
    if (hoverId.startsWith('emp:')) {
      const a = agents.find((x) => `emp:${x.id}` === hoverId);
      return a ? `${a.role || 'AI agent'} · ${a.instance} · ${a.model}` : 'AI agent';
    }
    if (hoverId.startsWith('person:')) {
      const p = people.find((x) => `person:${x.id}` === hoverId);
      return p ? `${p.role} · human` : 'human';
    }
    if (hoverId.startsWith('task:')) {
      const t = tasks.find((x) => `task:${x.id}` === hoverId);
      return t ? `SOP · ${t.steps.length} steps · ${departments.find((d) => d.id === t.departmentId)?.name ?? ''}` : 'SOP task';
    }
    if (hoverId.startsWith('tool:')) {
      const label = labelById.get(hoverId) ?? '';
      const users = graph.edges.filter((e) => e.kind === 'uses' && e.target === hoverId).length;
      return `${label} · wired to ${users} worker${users === 1 ? '' : 's'}`;
    }
    if (hoverId.startsWith('team:')) {
      const d = departments.find((x) => `team:${x.id}` === hoverId);
      return d?.tagline || 'pillar';
    }
    return 'the memory core · all of Alex’s markdown';
  }, [hoverId, agents, people, tasks, departments, graph, labelById]);

  const incident = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    for (const s of strands) {
      if (s.source === hoverId) set.add(s.target);
      if (s.target === hoverId) set.add(s.source);
    }
    return set;
  }, [hoverId, strands]);

  // camera: zoom toward the hovered neuron, ease back on leave
  const hoverPos = hoverId ? pos.get(hoverId) : null;
  const camera = hoverPos
    ? { transform: `scale(1.55)`, transformOrigin: `${hoverPos.x}px ${hoverPos.y}px` }
    : { transform: 'scale(1)', transformOrigin: `${NEURAL_W / 2}px ${NEURAL_H / 2}px` };

  // each edge renders as a BUNDLE of frayed sub-strands — the dense, silky,
  // organic web of the reference: thousands of overlapping filaments instead
  // of one clinical line per connection
  const STRANDS_PER_EDGE = 5;
  const strandPath = (s: NeuralStrand, k: number) => {
    const a = pos.get(s.source)!;
    const b = pos.get(s.target)!;
    const h = hashStr(`${s.source}→${s.target}#${k}`);
    const fray = ((h % 15) - 7) * 0.9; // endpoint fray so bundles read as rope
    const bow = ((((h >> 4) % 61) - 30) / 30) * 42;
    const mx = (a.x + b.x) / 2 + (((h >> 10) % 31) - 15);
    return `M ${a.x} ${a.y + fray * 0.4} C ${mx} ${a.y + bow}, ${mx} ${b.y - bow}, ${b.x} ${b.y + fray * 0.25}`;
  };

  const strandOpacity = (s: NeuralStrand, base: number) => {
    if (!incident) return base;
    return s.source === hoverId || s.target === hoverId ? Math.min(1, base * 5 + 0.3) : base * 0.15;
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg-t border border-os-border"
      style={{ background: NAVY_BG }}
      onMouseLeave={() => setHoverId(null)}
    >
      <svg viewBox={`0 0 ${NEURAL_W} ${NEURAL_H}`} className="block w-full" role="img" aria-label="G-Brain neural view">
        <defs>
          <radialGradient id="ngGlow" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#1b2a56" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#111a38" stopOpacity="0.55" />
            <stop offset="100%" stopColor={NAVY_BG} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={NEURAL_W} height={NEURAL_H} fill={NAVY_BG} />
        <rect width={NEURAL_W} height={NEURAL_H} fill="url(#ngGlow)" />

        {/* faint elliptical contours arcing around the stack for depth */}
        {[0.62, 0.78, 0.94].map((k) => (
          <ellipse
            key={k}
            cx={NEURAL_W / 2}
            cy={NEURAL_H / 2}
            rx={(NEURAL_W / 2) * k}
            ry={(NEURAL_H / 2) * (k - 0.14)}
            fill="none"
            stroke="#31406e"
            strokeWidth={0.7}
            opacity={0.35}
          />
        ))}

        {/* camera rig: everything below zooms toward the hovered neuron */}
        <g style={{ ...camera, transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1), transform-origin 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {/* the web — every strand drawn twice (wide faint pass = bloom, thin
              pass = core), split into three shimmering groups */}
          {SHIMMER.map((style, gi) => (
            <g key={gi} style={style}>
              {strands.map((s, i) => {
                if (i % SHIMMER.length !== gi) return null;
                const a = pos.get(s.source)!;
                // brightest near the inputs, thinning toward the output
                const layerFade = 1 - (a.x / NEURAL_W) * 0.45;
                const base = (0.05 + Math.abs(s.weight) * 0.16) * layerFade;
                const tint = s.weight >= 0 ? POS_COLOR : NEG_COLOR;
                const o = strandOpacity(s, base);
                const hot = Math.abs(s.weight) > 0.7; // blow-out candidates
                return (
                  <g key={`${s.source}→${s.target}`} opacity={o} style={{ transition: 'opacity 300ms' }}>
                    {Array.from({ length: STRANDS_PER_EDGE }, (_, k) => {
                      const d = strandPath(s, k);
                      return (
                        <g key={k}>
                          {k === 0 && <path d={d} fill="none" stroke={tint} strokeWidth={2.6} opacity={0.3} />}
                          <path d={d} fill="none" stroke={tint} strokeWidth={0.55} opacity={0.8} />
                          {hot && k === 2 && (
                            // the brightest filaments blow out toward white
                            <path d={d} fill="none" stroke="#f4f7ff" strokeWidth={0.4} opacity={0.55} />
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          ))}

          {/* same-layer reporting lines — faint vertical arcs */}
          {reports.map((r) => {
            const a = pos.get(r.source);
            const b = pos.get(r.target);
            if (!a || !b) return null;
            const dim = incident && !(incident.has(r.source) && incident.has(r.target));
            return (
              <path
                key={`${r.source}→${r.target}`}
                d={`M ${a.x} ${a.y} C ${a.x - 34} ${(a.y + b.y) / 2}, ${b.x - 34} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`}
                fill="none"
                stroke="#8fa3d9"
                strokeWidth={0.6}
                opacity={dim ? 0.05 : 0.22}
                style={{ transition: 'opacity 300ms' }}
              />
            );
          })}

          {/* neurons */}
          {layers.map((layer, li) =>
            layer.nodeIds.map((id) => {
              const p = pos.get(id)!;
              const isSelf = layer.kind === 'self';
              const dimmed = incident ? !incident.has(id) : false;
              const r = isSelf ? 10 : layer.kind === 'team' ? 5 : 2.6;
              return (
                <g
                  key={id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dimmed ? 0.15 : 1}
                  style={{ transition: 'opacity 300ms', cursor: 'pointer' }}
                  onMouseEnter={() => setHoverId(id)}
                  onClick={() => setSelectedId((cur) => (cur === id ? null : id))}
                >
                  <title>{labelById.get(id) ?? id}</title>
                  <circle r={Math.max(8, r + 5)} fill="transparent" />
                  <circle r={r} fill={isSelf ? '#e35c35' : DOT_COLOR} fillOpacity={isSelf ? 1 : 0.92} />
                  {isSelf && <circle r={r + 5} fill="none" stroke="#e35c35" strokeWidth={0.8} opacity={0.5} />}
                  {/* input layer: monospace label + tiny sparkline */}
                  {layer.kind === 'tool' && (
                    <>
                      <text
                        x={-10}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fontFamily="var(--font-mono)"
                        fontSize={7.5}
                        fill="#93a3cf"
                      >
                        {(labelById.get(id) ?? id).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 16)}
                      </text>
                      <polyline points={sparkPts(id, 6, 0)} fill="none" stroke="#5b6d9e" strokeWidth={0.8} />
                    </>
                  )}
                  {layer.kind === 'team' && (
                    <text x={9} dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={8.5} fill="#aeb9e2">
                      {labelById.get(id)}
                    </text>
                  )}
                  {isSelf && (
                    <text y={24} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9.5} fontWeight={600} fill="#e35c35">
                      Notes
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </g>
      </svg>

      {/* floating layer cards — terminal panels; the hovered node's layer
          card morphs to show that node's values live */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-around px-6">
        {layers.map((layer, li) => {
          const live = li === hoverLayerIndex && hoverId;
          return (
            <div
              key={layer.kind}
              className={`pointer-events-auto max-w-[220px] rounded-sm-t border px-2.5 py-1.5 font-mono text-[9.5px] leading-relaxed backdrop-blur transition-colors ${
                live ? 'border-[#5ee8a2]/60 bg-[#0d142e]/95' : 'border-[#2a3a6a] bg-[#0d142e]/85'
              }`}
            >
              <div className="truncate font-semibold tracking-wide text-[#c7d2f2]">
                {live ? labelById.get(hoverId!) ?? layer.name : layer.name}
              </div>
              <div className="truncate text-[#7d8cbd]">
                {live ? hoverSub : `Neurons: ${layer.nodeIds.length}`}
              </div>
              <button
                className="text-[#ff5f6b] transition-colors hover:text-[#ff8b93]"
                onClick={() => setActs((a) => a.map((v, i) => (i === li ? (v + 1) % ACTIVATIONS.length : v)))}
                title="Cycle activation"
              >
                Activation: {ACTIVATIONS[acts[li]]} (click)
              </button>
            </div>
          );
        })}
      </div>

      {/* the same detail panels as the radial view, opened by clicking a
          neuron — absolute overlay so the network never reflows */}
      {selectedId && (
        <div className="absolute inset-y-0 right-0 z-10 w-80 border-l border-os-border-strong bg-os-bg/95 backdrop-blur">
          <NeuralDetail
            nodeId={selectedId}
            graph={graph}
            agents={agents}
            departments={departments}
            people={people}
            tasks={tasks}
            runsByAgent={runsByAgent}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes ng-shimmer { from { opacity: 0.72; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  [style*='ng-shimmer'] { animation: none !important; }
}
`,
        }}
      />
    </div>
  );
}
