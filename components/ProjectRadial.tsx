'use client';

/**
 * Project/task ops in the G-Brain Radial grammar — the same machinery as the
 * /brain wheel, end to end: live d3-force physics over resting targets, a
 * cinematic viewBox camera (auto-frames the focused sector, tracks a selected
 * task as the physics drifts it, scroll-wheel zooms about the cursor, dragging
 * the canvas pans), the rotating orbital backdrop, the drifting grid,
 * edgeArc'd spokes with synapse pulses, hover lighting a node's whole chain,
 * drag with a soft physics release, the in-canvas detail card on the left,
 * the big white stage title, and ‹ › pillar-stepping (buttons + arrow keys).
 * Local state only: the reference mock for wiring the agent_tasks repo later.
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
import {
  ArrowLeft, ChevronLeft, ChevronRight, CircleDot, ClipboardList, FolderKanban,
  ListChecks, Maximize2, Minimize2, Sparkles, Trash2, X,
} from 'lucide-react';
import { Label } from '@/components/terminal';
import { edgeArc } from '@/lib/tree-layout';
import { rafThrottle } from '@/lib/raf-throttle';
import { lerpRect, type Rect } from '@/lib/memory-core';
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
  type MockTask,
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

// labels keep ONE on-screen size at every camera depth (see /brain): the
// camera loop publishes viewBox-width / canvas-width as --kg-cam-k and every
// font counter-scales through it
const fixedLabel = (px: number): React.CSSProperties => ({
  fontSize: `calc(${px}px * var(--kg-cam-k, 1))`,
});

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

/** Auto-framing, the /brain way: home is the padded whole wheel, a focused
    sector gets a medium frame past its gateway, a selected task a tight one. */
function autoCamera(focusPos: { x: number; y: number } | null, taskPos: { x: number; y: number } | null): Rect {
  if (taskPos) {
    const w = W * 0.46;
    const h = H * 0.46;
    return { x: taskPos.x - w / 2, y: taskPos.y - h / 2, w, h };
  }
  if (focusPos) {
    // frame the sector: center a bit past the gateway, toward its fan
    const ux = (focusPos.x - CX) / (Math.hypot(focusPos.x - CX, focusPos.y - CY) || 1);
    const uy = (focusPos.y - CY) / (Math.hypot(focusPos.x - CX, focusPos.y - CY) || 1);
    const cx = focusPos.x + ux * 52;
    const cy = focusPos.y + uy * 52;
    const w = W * 0.68;
    const h = H * 0.68;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  return { x: -W * 0.03, y: -H * 0.03, w: W * 1.06, h: H * 1.06 };
}

function isTyping(): boolean {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
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
  // Manual camera (mirrors /brain): scroll-wheel zooms about the cursor,
  // dragging the canvas pans; both write this rect and the glide loop honours
  // it until the next click hands control back to the auto framing.
  const userViewRef = useRef<Rect | null>(null);
  const panRef = useRef<{ px: number; py: number; x: number; y: number; k: number; moved: boolean } | null>(null);
  const panSuppressRef = useRef(false);

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
  // its project + siblings — the same pillar-chain rule as /brain
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
  // the node SET changes (task added/removed). Rest targets change with focus
  // and the sim reheats to glide everything to its new spot.
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

  // ── the camera ─────────────────────────────────────────────────────────────
  // The viewBox glides toward (then tracks) whatever is focused/selected,
  // reading LIVE sim positions every frame so it follows the drift — written
  // straight to the svg attribute so it never fights React's render.
  const camStateRef = useRef({ focusId: null as string | null, selectedTaskId: null as string | null });
  camStateRef.current = { focusId, selectedTaskId };
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let cur: Rect = { x: -W * 0.03, y: -H * 0.03, w: W * 1.06, h: H * 1.06 };
    let raf = 0;
    const step = () => {
      const c = camStateRef.current;
      const posOf = (id: string | null) => {
        if (!id) return null;
        const n = nodesRef.current.find((m) => m.id === id);
        return n ? { x: n.x, y: n.y } : null;
      };
      const target = userViewRef.current ?? autoCamera(posOf(c.focusId), posOf(c.selectedTaskId));
      const goingHome = !userViewRef.current && !c.focusId && !c.selectedTaskId;
      const next = lerpRect(cur, target, reduced ? 1 : goingHome ? 0.06 : 0.1);
      if (next !== cur) {
        cur = next;
        const svg = svgRef.current;
        if (svg) {
          svg.setAttribute('viewBox', `${cur.x} ${cur.y} ${cur.w} ${cur.h}`);
          // zoom factor for the constant-size label counter-scale
          svg.style.setProperty('--kg-cam-k', String(cur.w / W));
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Scroll-wheel zoom about the cursor. Attached manually (non-passive) so
  // preventDefault can stop the page from scrolling under the graph.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vb = svg.viewBox.baseVal;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      const p = ctm ? pt.matrixTransform(ctm.inverse()) : { x: CX, y: CY };
      const f = Math.min(2, Math.max(0.5, Math.exp(e.deltaY * 0.0012)));
      const w = Math.min(W * 3, Math.max(W * 0.12, vb.width * f));
      const k = w / vb.width;
      userViewRef.current = {
        x: p.x - (p.x - vb.x) * k,
        y: p.y - (p.y - vb.y) * k,
        w,
        h: vb.height * k,
      };
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Dragging the canvas background pans the manual camera; node drags stop
  // propagation before these fire, so the two never fight.
  const onCanvasPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || e.button !== 0) return;
    const vb = svg.viewBox.baseVal;
    const ctm = svg.getScreenCTM();
    panRef.current = { px: e.clientX, py: e.clientY, x: vb.x, y: vb.y, k: ctm ? 1 / ctm.a : 1, moved: false };
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onCanvasPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = panRef.current;
    const svg = svgRef.current;
    if (!p || !svg) return;
    const dx = e.clientX - p.px;
    const dy = e.clientY - p.py;
    if (!p.moved && Math.hypot(dx, dy) < 3) return;
    p.moved = true;
    const vb = svg.viewBox.baseVal;
    userViewRef.current = { x: p.x - dx * p.k, y: p.y - dy * p.k, w: vb.width, h: vb.height };
  };
  const onCanvasPointerUp = () => {
    if (panRef.current?.moved) panSuppressRef.current = true;
    panRef.current = null;
  };

  // ── node dragging ──────────────────────────────────────────────────────────
  const simNode = (id: string) => nodesRef.current.find((n) => n.id === id) ?? null;
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
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
  const setStatus = (taskId: string, status: MockTaskStatus) => {
    setProjects((prev) =>
      prev.map((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) })),
    );
  };
  const advance = (taskId: string) => {
    const t = taskById.get(taskId);
    if (t) setStatus(taskId, cycleStatus(t.status));
  };
  const removeTask = (taskId: string) => {
    setSelectedTaskId((cur) => (cur === taskId ? null : cur));
    setProjects((prev) => prev.map((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== taskId) })));
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
  const clearAll = () => {
    setFocusId(null);
    setSelectedTaskId(null);
    userViewRef.current = null;
  };
  const focusProject = (id: string | null) => {
    setFocusId(id);
    setSelectedTaskId(null);
    userViewRef.current = null;
  };
  const selectTask = (id: string) => {
    const proj = projectOf.get(id);
    if (proj) setFocusId(proj.id);
    setSelectedTaskId(id);
    userViewRef.current = null;
  };
  const stepProject = (dir: -1 | 1) => {
    if (projects.length === 0) return;
    const i = focusId ? projects.findIndex((p) => p.id === focusId) : -1;
    const next = projects[(i + dir + projects.length) % projects.length];
    focusProject(next.id);
  };
  const onNodeClick = (n: SimNode) => {
    if (n.kind === 'hub') clearAll();
    else if (n.kind === 'project') {
      if (focusId === n.id) clearAll();
      else focusProject(n.id);
    } else selectTask(n.id);
  };

  // arrow keys turn the wheel while focused; Escape walks back up (task → pillar → home)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === 'Escape') {
        if (camStateRef.current.selectedTaskId) setSelectedTaskId(null);
        else clearAll();
      } else if (camStateRef.current.focusId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        stepProject(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, focusId]);

  const focused = focusId ? projects.find((p) => p.id === focusId) ?? null : null;
  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) ?? null : null;
  const selectedProject = selectedTaskId ? projectOf.get(selectedTaskId) ?? null : null;
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

  // ── the in-canvas detail card, /brain's card language ──────────────────────
  const detailCard = selectedTask && selectedProject && (
    <div className="absolute left-3 top-[46px] z-10 flex max-h-[calc(100%-58px)] w-[300px] flex-col overflow-hidden rounded-lg-t border border-os-border-strong bg-os-bg/95 backdrop-blur">
      {/* trail bar: node → pillar → home */}
      <div className="flex shrink-0 items-center border-b border-os-border pr-1">
        <button
          onClick={() => setSelectedTaskId(null)}
          aria-label={`Back to ${selectedProject.name}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim transition-colors hover:text-os-text"
        >
          <ArrowLeft className="h-3 w-3 shrink-0" />
          <span className="truncate">
            Back · <span style={{ color: selectedProject.color }}>{selectedProject.name}</span>
          </span>
        </button>
        <button
          onClick={() => setSelectedTaskId(null)}
          aria-label="Close the task card"
          title="Close"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm-t text-os-dim transition-colors hover:text-os-err"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
        <div className="mb-0.5 text-[12.5px] font-bold leading-snug">{selectedTask.title}</div>
        <div className="mb-2 truncate font-mono text-[9.5px] text-os-dim">
          {selectedProject.name} · Task Wheel
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: STATUS_COLOR[selectedTask.status] }}
          >
            <CircleDot className="h-2.5 w-2.5" /> {STATUS_LABEL[selectedTask.status]}
          </span>
        </div>

        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
          <ListChecks className="h-3 w-3" /> the ladder
        </div>
        <div className="mb-3.5 flex flex-col gap-1">
          {(Object.keys(STATUS_LABEL) as MockTaskStatus[]).map((s) => {
            const active = selectedTask.status === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(selectedTask.id, s)}
                className={`flex items-center gap-2 rounded-sm-t border px-2 py-1.5 text-left transition-colors ${
                  active ? 'border-os-border-strong bg-os-surface' : 'border-os-border hover:border-os-border-strong'
                }`}
              >
                <span className="inline-block h-2 w-2 shrink-0" style={{ background: STATUS_COLOR[s] }} />
                <span className={`flex-1 text-[11px] ${active ? 'font-semibold text-os-text' : 'text-os-muted'}`}>
                  {STATUS_LABEL[s]}
                </span>
                {active && <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-os-dim">now</span>}
              </button>
            );
          })}
        </div>

        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
          <FolderKanban className="h-3 w-3" /> belongs to
        </div>
        <button
          onClick={() => {
            setSelectedTaskId(null);
            focusProject(selectedProject.id);
          }}
          className="mb-3.5 flex w-full items-center gap-2 rounded-sm-t border border-os-border px-2 py-1.5 text-left transition-colors hover:border-os-border-strong"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border" style={{ borderColor: selectedProject.color, color: selectedProject.color }}>
            <FolderKanban className="h-3 w-3" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{selectedProject.name}</span>
          <span className="shrink-0 font-mono text-[9.5px] text-os-dim">
            {selectedProject.tasks.filter((t) => t.status === 'done').length}/{selectedProject.tasks.length}
          </span>
        </button>

        <div className="flex gap-1.5">
          <button
            onClick={() => advance(selectedTask.id)}
            className="flex-1 rounded-sm-t border border-os-border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-os-muted transition-colors hover:border-os-accent hover:text-os-accent"
          >
            advance →
          </button>
          <button
            onClick={() => removeTask(selectedTask.id)}
            aria-label="Remove this task"
            title="Remove this task"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm-t border border-os-border text-os-dim transition-colors hover:border-os-err hover:text-os-err"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  const canvas = (
    <div className={`relative min-w-0 flex-1 overflow-hidden rounded-lg-t border border-os-border bg-os-surface ${fullscreen ? 'h-full' : ''}`}>
      <div className="kg-grid pointer-events-none absolute inset-0" aria-hidden />

      {/* stage title — big, bold, white, pinned top-center while focused */}
      {focused && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <span
            className="whitespace-nowrap text-[22px] font-bold uppercase leading-none tracking-[0.08em]"
            style={{ color: '#ffffff', textShadow: '0 1px 8px rgba(0,0,0,0.75)' }}
          >
            {focused.name}
          </span>
        </div>
      )}

      {/* top-left navigation: ← Back + the project switcher while focused */}
      {focused ? (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <button
            onClick={clearAll}
            aria-label="Back to the home view"
            title="Back to the home view"
            className="flex items-center gap-1.5 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-2 py-1.5 font-mono text-[10.5px] text-os-muted backdrop-blur transition-colors hover:text-os-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex items-center gap-0.5 rounded-sm-t border border-os-border-strong bg-os-bg/85 px-1 py-1 backdrop-blur">
            <button
              onClick={() => stepProject(-1)}
              aria-label="Previous project"
              title="Previous project (←)"
              className="flex h-6 w-6 items-center justify-center rounded-sm-t text-os-dim transition-colors hover:text-os-text"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => stepProject(1)}
              aria-label="Next project"
              title="Next project (→)"
              className="flex h-6 w-6 items-center justify-center rounded-sm-t text-os-dim transition-colors hover:text-os-text"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <span className="max-w-[120px] truncate px-1.5 font-mono text-[11px] font-semibold" style={{ color: focused.color }}>
              {focused.name}
            </span>
            <button
              onClick={clearAll}
              aria-label="Close focus"
              title="Back to all"
              className="flex h-6 w-6 items-center justify-center rounded-sm-t border-l border-os-border text-os-dim transition-colors hover:text-os-err"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
          Reference mock · local state only
        </div>
      )}

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
        viewBox={`${-W * 0.03} ${-H * 0.03} ${W * 1.06} ${H * 1.06}`}
        className="h-full w-full"
        role="img"
        aria-label="Radial project and task wheel"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onClick={() => {
          // a drag that actually panned must not read as a background click
          if (panSuppressRef.current) {
            panSuppressRef.current = false;
            return;
          }
          clearAll();
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
              ? 'MISSIONS'
              : n.kind === 'project'
                ? (proj?.name ?? '').toUpperCase()
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
                    ? `${task?.title} — ${STATUS_LABEL[task?.status ?? 'open']} · click to open`
                    : 'Missions — click to release focus'}
              </title>
              {selected && <circle r={r + 3.5} fill="none" stroke={SELECT_COLOR} strokeWidth={1} opacity={0.4} />}
              {/* project gateways wear their done-fraction as a gauge arc, the
                  same language as the G-Brain health ring */}
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
                  style={{ pointerEvents: 'none', ...fixedLabel(n.kind === 'task' ? 8.5 : 10) }}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* inline detail overlay — the task card, on the LEFT like /brain */}
      {detailCard}

      {/* project nav — pinned bottom-center while focused, always reachable */}
      {focused && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-os-border-strong bg-os-bg/90 px-1.5 py-1.5 backdrop-blur">
          <button
            onClick={() => stepProject(-1)}
            aria-label="Turn to the previous project"
            title="Previous project (←)"
            className="flex h-9 w-9 items-center justify-center rounded-full text-os-muted transition-colors hover:bg-os-surface hover:text-os-text"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[92px] px-1 text-center font-mono text-[11px] font-semibold leading-none" style={{ color: focused.color }}>
            {focused.name}
          </span>
          <button
            onClick={() => stepProject(1)}
            aria-label="Turn to the next project"
            title="Next project (→)"
            className="flex h-9 w-9 items-center justify-center rounded-full text-os-muted transition-colors hover:bg-os-surface hover:text-os-text"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

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

  const taskRow = (t: MockTask) => (
    <li key={t.id}>
      <div
        className={`flex w-full items-center gap-2 border-b border-os-hairline px-1 py-2 transition-colors hover:bg-os-surface2 ${
          selectedTaskId === t.id ? 'bg-os-surface2' : ''
        }`}
        onMouseEnter={() => setHoverId(t.id)}
        onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
      >
        <button
          onClick={() => advance(t.id)}
          aria-label={`Advance ${t.title}`}
          title={`${STATUS_LABEL[t.status]} — click to advance`}
          className="grid h-4 w-4 shrink-0 place-items-center"
        >
          <span className="inline-block h-2 w-2" style={{ background: STATUS_COLOR[t.status] }} />
        </button>
        <button
          onClick={() => selectTask(t.id)}
          className={`min-w-0 flex-1 text-left text-[12px] text-os-muted transition-colors hover:text-os-text ${
            t.status === 'done' ? 'line-through opacity-55' : ''
          }`}
          title="Open the task card"
        >
          {t.title}
        </button>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-os-dim">{STATUS_LABEL[t.status]}</span>
      </div>
    </li>
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
              onClick={clearAll}
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
          <ul className="flex flex-col">{focused.tasks.map(taskRow)}</ul>
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
                    onClick={() => focusProject(p.id)}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                    className="flex w-full items-center gap-2.5 border-b border-os-hairline px-1 py-2.5 text-left text-[12px] text-os-muted transition-colors hover:bg-os-surface2 hover:text-os-text"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border" style={{ borderColor: p.color, color: p.color }}>
                      <FolderKanban className="h-3 w-3" strokeWidth={2} />
                    </span>
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
            hover traces a chain · click a project to turn the wheel · click a task for its card · scroll zooms ·
            drag the canvas to pan · ←/→ step projects
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
