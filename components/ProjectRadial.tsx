'use client';

/**
 * Project/task ops in the G-Brain Radial grammar — same machinery as the
 * /brain wheel, not an imitation: live d3-force physics over resting targets,
 * the slowly-rotating orbital backdrop, the drifting grid, edgeArc'd spokes
 * with synapse pulses, hover lighting a node's whole chain, drag with a soft
 * physics release. Operator hub at the core, projects on ring 1 (progress arc
 * around each), their tasks fanned inside the sector on ring 2, colored by
 * status. Click a project: the wheel reflows — its sector spreads wide, the
 * rest tuck away. Click a task (wheel or panel) to advance its status; add
 * tasks from the panel and watch them join the physics. Local state only:
 * this is the reference mock for wiring the agent_tasks repo later.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { ClipboardList, FolderKanban, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { Label } from '@/components/terminal';
import { edgeArc } from '@/lib/tree-layout';
import { rafThrottle } from '@/lib/raf-throttle';
import {
  cycleStatus,
  demoProjects,
  polarPoint,
  projectAngles,
  projectProgress,
  sectorTaskAngles,
  STATUS_COLOR,
  STATUS_LABEL,
  type MockProject,
  type MockTaskStatus,
} from '@/lib/project-radial';

const W = 880;
const H = 600;
const CX = W / 2;
const CY = H / 2;
const R_PROJECT = 158;
const R_TASK = 252;
// selection echoes the vault orange — one visual language with /brain
const SELECT_COLOR = '#e35c35';

type SimNode = {
  id: string;
  kind: 'hub' | 'project' | 'task';
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};
type SimLink = { source: SimNode | string; target: SimNode | string; kind: 'pillar' | 'sop' };

type Rest = Map<string, { x: number; y: number }>;

/**
 * Resting spots for the current focus: at home every sector is symmetric; with
 * a project focused its fan spreads wide and steps out while the others tuck
 * their tasks close behind their gateway — the physics animates the reflow.
 */
function restLayout(projects: MockProject[], focusId: string | null): Rest {
  const rest: Rest = new Map();
  rest.set('hub', { x: CX, y: CY });
  const angles = projectAngles(projects.length);
  projects.forEach((p, i) => {
    const [px, py] = polarPoint(CX, CY, R_PROJECT, angles[i]);
    rest.set(p.id, { x: px, y: py });
    const focused = focusId === p.id;
    const tucked = focusId !== null && !focused;
    const spread = focused ? 104 : tucked ? 18 : 46;
    const radius = focused ? R_TASK + 34 : tucked ? R_TASK - 46 : R_TASK;
    const fan = sectorTaskAngles(angles[i], p.tasks.length, spread);
    p.tasks.forEach((t, j) => {
      const [tx, ty] = polarPoint(CX, CY, radius, fan[j]);
      rest.set(t.id, { x: tx, y: ty });
    });
  });
  return rest;
}

export function ProjectRadial() {
  const [projects, setProjects] = useState<MockProject[]>(demoProjects);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [draft, setDraft] = useState('');
  const [, setTick] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const restRef = useRef<Rest>(new Map());
  const dragRef = useRef<{ id: string; moved: boolean; startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef(false);

  const projectOf = useMemo(() => {
    const m = new Map<string, MockProject>();
    for (const p of projects) {
      m.set(p.id, p);
      for (const t of p.tasks) m.set(t.id, p);
    }
    return m;
  }, [projects]);
  const taskById = useMemo(() => new Map(projects.flatMap((p) => p.tasks.map((t) => [t.id, t] as const))), [projects]);

  // hover lights the whole chain: a project lights its tasks + the hub, a task
  // lights its project + siblings' gateway line back to the core
  const lit = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>(['hub', hoverId]);
    const proj = projectOf.get(hoverId);
    if (proj) {
      set.add(proj.id);
      for (const t of proj.tasks) set.add(t.id);
    }
    return set;
  }, [hoverId, projectOf]);

  const focusSet = useMemo(() => {
    if (!focusId) return null;
    const p = projects.find((x) => x.id === focusId);
    if (!p) return null;
    return new Set<string>(['hub', p.id, ...p.tasks.map((t) => t.id)]);
  }, [focusId, projects]);

  // ── the simulation ─────────────────────────────────────────────────────────
  // Node identity is stable across status changes; the sim only rebuilds when
  // the node SET changes (a task added). Rest targets change with focus and
  // the sim reheats to glide everything to its new spot.
  const structureKey = useMemo(
    () => projects.map((p) => `${p.id}:${p.tasks.map((t) => t.id).join(',')}`).join('|'),
    [projects],
  );

  useEffect(() => {
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    restRef.current = restLayout(projects, focusId);
    const rest = restRef.current;
    const spawn = (id: string, kind: SimNode['kind'], seedFrom?: string): SimNode => {
      const old = prev.get(id);
      if (old) return old;
      const at = (seedFrom && rest.get(seedFrom)) || rest.get(id) || { x: CX, y: CY };
      return { id, kind, x: at.x, y: at.y };
    };
    const nodes: SimNode[] = [
      spawn('hub', 'hub'),
      ...projects.flatMap((p) => [
        spawn(p.id, 'project'),
        // a NEW task materializes at its project gateway and rides the physics out
        ...p.tasks.map((t) => spawn(t.id, 'task', p.id)),
      ]),
    ];
    const links: SimLink[] = projects.flatMap((p) => [
      { source: 'hub', target: p.id, kind: 'pillar' as const },
      ...p.tasks.map((t) => ({ source: p.id, target: t.id, kind: 'sop' as const })),
    ]);
    nodesRef.current = nodes;
    linksRef.current = links;

    const renderTick = rafThrottle(() => setTick((t) => (t + 1) % 1_000_000));
    const sim = forceSimulation(nodes)
      // same feel as /brain: extra friction + slow cool-down → floaty drift
      .velocityDecay(0.62)
      .alphaDecay(0.015)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).strength(0.05))
      .force('charge', forceManyBody<SimNode>().strength(-24))
      .force('x', forceX<SimNode>((d) => restRef.current.get(d.id)?.x ?? CX).strength(0.18))
      .force('y', forceY<SimNode>((d) => restRef.current.get(d.id)?.y ?? CY).strength(0.18))
      .force('collide', forceCollide<SimNode>((d) => (d.kind === 'hub' ? 26 : d.kind === 'project' ? 20 : 10)))
      .on('tick', renderTick);
    // the operator core never wanders
    const hub = nodes.find((n) => n.id === 'hub');
    if (hub) {
      hub.fx = CX;
      hub.fy = CY;
    }
    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // focus turns the wheel: swap rest targets, reheat, physics does the rest.
  // d3 caches each force's per-node target at initialize time, so the
  // accessors must be re-assigned — writing restRef alone moves nothing.
  useEffect(() => {
    restRef.current = restLayout(projects, focusId);
    const sim = simRef.current;
    if (!sim) return;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (sim.force('x') as any)?.x((d: SimNode) => restRef.current.get(d.id)?.x ?? CX);
    (sim.force('y') as any)?.y((d: SimNode) => restRef.current.get(d.id)?.y ?? CY);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    sim.alpha(0.5).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, structureKey]);

  // ── drag: grab any node, physics takes it back on release ─────────────────
  const simNode = (id: string) => nodesRef.current.find((n) => n.id === id);
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };
  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (id === 'hub') return;
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    dragRef.current = { id, moved: false, startX: e.clientX, startY: e.clientY };
    const node = simNode(id);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
    simRef.current?.alphaTarget(0.2).restart();
  };
  const onNodePointerMove = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3) drag.moved = true;
    const p = toSvgPoint(e.clientX, e.clientY);
    const node = simNode(id);
    if (p && node) {
      node.fx = p.x;
      node.fy = p.y;
    }
  };
  const onNodePointerUp = (e: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* release is best-effort */
    }
    const node = simNode(id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simRef.current?.alphaTarget(0).alpha(0.14).restart();
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
  };

  // ── ops ────────────────────────────────────────────────────────────────────
  const advance = (taskId: string) => {
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status: cycleStatus(t.status) } : t)),
      })),
    );
  };
  const addTask = () => {
    const title = draft.trim();
    const target = focusId;
    if (!title || !target) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === target
          ? { ...p, tasks: [...p.tasks, { id: `${p.id}-n${p.tasks.length}-${title.length}`, title, status: 'open' as const }] }
          : p,
      ),
    );
    setDraft('');
  };
  const onNodeClick = (n: SimNode) => {
    if (n.kind === 'hub') {
      setFocusId(null);
      setSelectedTaskId(null);
    } else if (n.kind === 'project') {
      setFocusId((cur) => (cur === n.id ? null : n.id));
      setSelectedTaskId(null);
    } else {
      setSelectedTaskId(n.id);
      advance(n.id);
    }
  };

  const focused = focusId ? projects.find((p) => p.id === focusId) ?? null : null;
  const posById = new Map(nodesRef.current.map((n) => [n.id, n]));
  const statusCounts = useMemo(() => {
    const c: Record<MockTaskStatus, number> = { open: 0, doing: 0, done: 0 };
    for (const p of projects) for (const t of p.tasks) c[t.status] += 1;
    return c;
  }, [projects]);

  // ── static backdrop (memoized: it never changes) ───────────────────────────
  const orbitalRings = useMemo(
    () => (
      <>
        <circle cx={CX} cy={CY} r={(R_PROJECT + R_TASK) / 2} fill="none" stroke="var(--border)" strokeWidth="1" opacity={0.24} />
        <g opacity={0.55}>
          <animateTransform attributeName="transform" attributeType="XML" type="rotate" from={`0 ${CX} ${CY}`} to={`360 ${CX} ${CY}`} dur="150s" repeatCount="indefinite" />
          {[R_PROJECT, R_TASK].map((r) => (
            <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 6" />
          ))}
        </g>
      </>
    ),
    [],
  );

  const nodeOpacity = (n: SimNode): number => {
    if (focusSet && !focusSet.has(n.id)) return n.kind === 'project' ? 0.35 : 0.12;
    if (lit && !lit.has(n.id)) return 0.15;
    return 1;
  };
  const showLabel = (n: SimNode): boolean => {
    if (n.kind !== 'task') return true;
    if (focusSet?.has(n.id)) return true;
    return lit?.has(n.id) ?? false;
  };

  const canvas = (
    <div className={`relative min-w-0 flex-1 overflow-hidden rounded-lg-t border border-os-border bg-os-surface ${fullscreen ? 'h-full' : ''}`}>
      <div className="kg-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        Reference mock · local state only
      </div>
      <button
        onClick={() => setFullscreen((v) => !v)}
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-sm-t border border-os-border-strong bg-os-bg/80 px-2 py-1 font-mono text-[10.5px] text-os-muted backdrop-blur transition-colors hover:text-os-accent"
      >
        {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        {fullscreen ? 'Close' : 'Fullscreen'}
      </button>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        role="img"
        aria-label="Radial project and task wheel"
        onClick={() => {
          setFocusId(null);
          setSelectedTaskId(null);
        }}
      >
        {orbitalRings}

        {/* the web: whisper-tinted arcs; hover raises the chain; synapse pulses
            travel each project's spoke so the wheel reads as alive */}
        {linksRef.current.map((l, i) => {
          const s = typeof l.source === 'object' ? l.source : posById.get(l.source);
          const t = typeof l.target === 'object' ? l.target : posById.get(l.target);
          if (!s || !t) return null;
          const proj = projectOf.get(t.id) ?? projectOf.get(s.id);
          const tint = proj?.color ?? 'var(--dim)';
          const incident = hoverId !== null && (s.id === hoverId || t.id === hoverId);
          const onChain = !lit || (lit.has(s.id) && lit.has(t.id));
          const inFocusChain = !focusSet || (focusSet.has(s.id) && focusSet.has(t.id));
          const arc = edgeArc(s, t);
          const opacity = !inFocusChain ? 0.04 : lit ? (incident ? 0.6 : onChain ? 0.35 : 0.05) : 0.16;
          return (
            <g key={i}>
              <path d={arc} fill="none" stroke={tint} strokeWidth={incident ? 1.6 : 0.9} strokeLinecap="round" opacity={opacity} style={{ transition: 'opacity 0.25s' }} />
              {!lit && inFocusChain && (
                <path
                  d={arc}
                  fill="none"
                  stroke={tint}
                  strokeWidth={l.kind === 'pillar' ? 1.7 : 1}
                  strokeLinecap="round"
                  pathLength={1}
                  className={l.kind === 'pillar' ? 'kg-synapse' : 'kg-synapse-sm'}
                  style={{ ['--kg-syn-delay' as string]: `${(i % 7) * -0.7}s` }}
                />
              )}
            </g>
          );
        })}

        {nodesRef.current.map((n) => {
          const proj = n.kind === 'project' ? projectOf.get(n.id) : undefined;
          const task = n.kind === 'task' ? taskById.get(n.id) : undefined;
          const color = n.kind === 'hub' ? 'var(--text)' : n.kind === 'project' ? proj?.color ?? 'var(--text)' : STATUS_COLOR[task?.status ?? 'open'];
          const r = n.kind === 'hub' ? 18 : n.kind === 'project' ? 15 : 7.5;
          const Icon = n.kind === 'hub' ? Sparkles : n.kind === 'project' ? FolderKanban : ClipboardList;
          const selected = selectedTaskId === n.id || focusId === n.id;
          const progress = proj ? projectProgress(proj.tasks) : 0;
          const arcR = r + 4.5;
          const arcC = 2 * Math.PI * arcR;
          const label =
            n.kind === 'hub'
              ? 'Missions'
              : n.kind === 'project'
                ? proj?.name ?? ''
                : (task?.title.length ?? 0) > 26
                  ? `${task!.title.slice(0, 24).trimEnd()}…`
                  : task?.title ?? '';
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              opacity={nodeOpacity(n)}
              style={{ cursor: dragRef.current?.id === n.id ? 'grabbing' : 'grab', transition: 'opacity 0.25s' }}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              onPointerMove={(e) => onNodePointerMove(e, n.id)}
              onPointerUp={(e) => onNodePointerUp(e, n.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onNodeClick(n);
              }}
            >
              <title>
                {n.kind === 'project'
                  ? `${proj?.name} — ${Math.round(progress * 100)}% done · click to focus`
                  : n.kind === 'task'
                    ? `${task?.title} — ${STATUS_LABEL[task?.status ?? 'open']} · click to advance`
                    : 'Missions — click to release focus'}
              </title>
              {selected && <circle r={r + 3.5} fill="none" stroke={SELECT_COLOR} strokeWidth={1} opacity={0.4} />}
              {/* project gateways wear their done-fraction as an arc, the same
                  gauge language as the G-Brain health ring */}
              {n.kind === 'project' && (
                <>
                  <circle r={arcR} fill="none" stroke="var(--border-strong)" strokeWidth={1.6} opacity={0.8} />
                  <circle
                    r={arcR}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeDasharray={`${progress * arcC} ${arcC}`}
                    transform="rotate(-90)"
                    style={{ transition: 'stroke-dasharray 0.5s var(--ease, ease)' }}
                  />
                </>
              )}
              {/* in-progress tasks breathe, like the live agents on /brain */}
              {task?.status === 'doing' && <circle r={r + 3} fill="none" stroke={color} strokeWidth={0.9} className="pr-breathe" />}
              <circle
                r={r}
                fill={n.kind === 'hub' ? color : 'var(--surface)'}
                stroke={color}
                strokeWidth={selected || hoverId === n.id ? 2.5 : 1.5}
              />
              <g style={{ color: n.kind === 'hub' ? 'var(--bg)' : color }}>
                <Icon x={-r * 0.62} y={-r * 0.62} width={r * 1.24} height={r * 1.24} strokeWidth={2} />
              </g>
              {showLabel(n) && (
                <text
                  x={0}
                  y={r + 11}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontWeight={n.kind === 'task' ? 400 : 600}
                  fill={n.kind === 'project' ? color : 'var(--text-2)'}
                  fontSize={n.kind === 'hub' ? 10 : n.kind === 'project' ? 10 : 8.5}
                  style={{ pointerEvents: 'none' }}
                >
                  {n.kind === 'hub' ? 'MISSIONS' : n.kind === 'project' ? label.toUpperCase() : label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes kg-drift { from { background-position: 0 0; } to { background-position: 44px 44px; } }
.kg-grid {
  background-image:
    linear-gradient(to right, var(--border-strong) 1px, transparent 1px),
    linear-gradient(to bottom, var(--border-strong) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.4;
  animation: kg-drift 26s linear infinite;
}
@keyframes pr-breathe { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.7; } }
.pr-breathe { animation: pr-breathe 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .kg-grid, .pr-breathe { animation: none; }
}
`,
        }}
      />
    </div>
  );

  const panel = (
    <aside className="flex shrink-0 flex-col gap-4 overflow-y-auto rounded-lg-t border border-os-border bg-os-surface p-3.5 lg:w-80">
      <div>
        <div className="mb-2.5">
          <Label rule>Legend</Label>
        </div>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(STATUS_LABEL) as MockTaskStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2 font-mono text-[11px] text-os-muted">
              <span className="inline-block h-2 w-2 shrink-0" style={{ background: STATUS_COLOR[s] }} />
              <span className="flex-1">{STATUS_LABEL[s]}</span>
              <span className="text-os-dim">{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {focused ? (
        <div className="min-h-0">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <Label rule>{focused.name}</Label>
            <button
              onClick={() => {
                setFocusId(null);
                setSelectedTaskId(null);
              }}
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim transition-colors hover:text-os-text"
            >
              all ✕
            </button>
          </div>
          {/* done-fraction meter — the same honest gauge as /brain's health bar */}
          <div className="mb-1 mt-2 h-[5px] w-full bg-os-border-strong">
            <div
              className="h-full transition-[width] duration-500"
              style={{ width: `${projectProgress(focused.tasks) * 100}%`, background: focused.color }}
            />
          </div>
          <div className="mb-2 font-mono text-[10px] text-os-dim">
            {focused.tasks.filter((t) => t.status === 'done').length}/{focused.tasks.length} done ·{' '}
            {Math.round(projectProgress(focused.tasks) * 100)}%
          </div>
          <ul className="flex flex-col">
            {focused.tasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setSelectedTaskId(t.id);
                    advance(t.id);
                  }}
                  onMouseEnter={() => setHoverId(t.id)}
                  onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
                  className="flex w-full items-center gap-2.5 border-b border-os-hairline px-1 py-2 text-left text-[12px] text-os-muted transition-colors hover:bg-os-surface2 hover:text-os-text"
                  title="Click to advance status"
                >
                  <span className="inline-block h-2 w-2 shrink-0" style={{ background: STATUS_COLOR[t.status] }} />
                  <span className={`min-w-0 flex-1 ${t.status === 'done' ? 'line-through opacity-55' : ''}`}>{t.title}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-os-dim">
                    {STATUS_LABEL[t.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              addTask();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="add a task to this project…"
              className="min-w-0 flex-1 rounded-sm-t border border-os-border bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-os-text outline-none placeholder:text-os-dim focus:border-os-border-strong"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="shrink-0 rounded-sm-t border border-os-border px-2.5 font-mono text-[11px] text-os-muted transition-colors hover:border-os-accent hover:text-os-accent disabled:opacity-40"
            >
              add
            </button>
          </form>
        </div>
      ) : (
        <div className="min-h-0">
          <div className="mb-2.5">
            <Label count={projects.length} rule>
              Projects
            </Label>
          </div>
          <ul className="flex flex-col">
            {projects.map((p) => {
              const done = p.tasks.filter((t) => t.status === 'done').length;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setFocusId(p.id)}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                    className="flex w-full items-center gap-2.5 border-b border-os-hairline px-1 py-2.5 text-left text-[12px] text-os-muted transition-colors hover:bg-os-surface2 hover:text-os-text"
                  >
                    <span className="inline-block h-2 w-2 shrink-0" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-os-dim">
                      {done}/{p.tasks.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 font-mono text-[10px] leading-relaxed text-os-dim">
            hover traces a chain · click a project to turn the wheel · click a task to advance it · drag anything
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[70] flex flex-col gap-3 bg-os-bg p-5 lg:flex-row' : 'flex h-full flex-col gap-3 lg:flex-row'}>
      {canvas}
      {panel}
    </div>
  );
}
