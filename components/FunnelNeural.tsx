'use client';

/**
 * The flow view as a plasma neural network. Midnight-navy starfield; every
 * lead is a neuron in each layer it reached, its stage transitions draw the
 * energy web (neon green = hot momentum, yellow = warm/cold active, red =
 * stalled/decaying, opacity = likelihood), sparks travel every strand and a
 * random filament arc-flashes while idle. Touching a neuron is the Tesla-
 * ball moment: a stark-white burst fans from it to the neighboring cohort
 * in the adjacent layers, its own journey stays the brightest line, the
 * camera eases in and everything else dims. Click pins the journey card.
 * With nothing under the cursor the camera drifts a slow cinematic tour.
 * The burst fan is cohort context (visual, per Alex's reference); the
 * thick white path and every colored strand are real journeys.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { FunnelNeuralModel } from '@/lib/funnel-neural';
import { rnd, smoothK } from '@/lib/funnel-viz';
import { FunnelNodeCard } from '@/components/FunnelNodeCard';

const W = 1240;
const H = 640;
const CY = H / 2 + 14;
const GUTTER = 168; // labeled-input gutter on the left
const X0 = GUTTER + 46;
const X1 = W - 70;
const COL_TOP = 74;
const COL_BOTTOM = H - 44;

/** Self-contained navy palette — this canvas keeps its own night sky. */
const INK = {
  bgCore: '#101a3d',
  bgMid: '#070d22',
  bgEdge: '#04060f',
  dot: '#dbe4ff',
  white: '#f5f8ff',
  contour: '#233462',
  frame: '#24335f',
  label: '#8fa0d0',
  leader: '#2a3a6e',
};

/** Plasma energy hues — neon green / yellow / red strands, Tesla-ball style. */
const HUE_COLOR = { green: '#3dff9c', yellow: '#ffdf4d', red: '#ff4d5d' } as const;

/** Burst fan size per adjacent layer — the plasma-glass filament count. */
const BURST_FAN = 26;
/** Manual zoom bounds — Alex drives the camera, nothing else does. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const ACTIVATIONS = ['ReLU', 'tanh', 'sigmoid', 'GELU'];

const layerX = (i: number, layers: number): number => X0 + (i * (X1 - X0)) / Math.max(1, layers - 1);

function rowY(row: number, count: number): number {
  const usable = COL_BOTTOM - COL_TOP;
  const gap = count > 1 ? Math.min(13, usable / (count - 1)) : 0;
  const center = (COL_TOP + COL_BOTTOM) / 2;
  return center - (gap * (count - 1)) / 2 + row * gap;
}

/** Curved strand between two neurons, with a per-strand vertical drift. */
function strandPath(x1: number, y1: number, x2: number, y2: number, wobble: number): string {
  const dx = x2 - x1;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx * 0.42).toFixed(1)} ${(y1 + wobble).toFixed(1)}, ${(x2 - dx * 0.42).toFixed(1)} ${(y2 - wobble).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** A burst filament: gently bowed quadratic from the anchor outward. */
function filamentPath(x1: number, y1: number, x2: number, y2: number, bow: number): string {
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2 + bow).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

type FocusNode = { leadId: string; layer: number; row: number };

export function FunnelNeural({ model }: { model: FunnelNeuralModel }) {
  const { layers, nodes, edges, labeled, leads } = model;
  const [focus, setFocus] = useState<FocusNode | null>(null);
  const [selNode, setSelNode] = useState<FocusNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activation, setActivation] = useState<number[]>(() => layers.map(() => 0));
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const camRef = useRef<SVGGElement>(null);
  const camState = useRef({ x: W / 2, y: CY, s: 1 });
  const camTarget = useRef({ x: W / 2, y: CY, s: 1 });
  const focusRef = useRef<FocusNode | null>(null);
  const selRef = useRef<FocusNode | null>(null);
  const groupRefs = useRef(new Map<string, SVGGElement>());
  const flashRef = useRef<{ el: SVGGElement | null; bucket: number; until: number }>({ el: null, bucket: -1, until: 0 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: 0 });
  selRef.current = selNode;

  // wheel-zoom needs passive: false to keep the page from scrolling — React's
  // synthetic onWheel can't preventDefault reliably, so attach directly.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      const tgt = camTarget.current;
      const ax = (px - (W / 2 - tgt.s * tgt.x)) / tgt.s;
      const ay = (py - (CY - tgt.s * tgt.y)) / tgt.s;
      const s2 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, tgt.s * Math.exp(-e.deltaY * 0.0016)));
      // keep the world point under the cursor fixed while the scale changes
      const psx = tgt.s * (ax - tgt.x) + W / 2;
      const psy = tgt.s * (ay - tgt.y) + CY;
      const nx = ax - (psx - W / 2) / s2;
      const ny = ay - (psy - CY) / s2;
      camTarget.current = {
        x: Math.min(W - W / (2 * s2), Math.max(W / (2 * s2), nx)),
        y: Math.min(H - H / (2 * s2), Math.max(H / (2 * s2), ny)),
        s: s2,
      };
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const layerCount = layers.length;

  const dotXY = (layer: number, row: number): { x: number; y: number } => ({
    x: layerX(layer, layerCount),
    y: rowY(row, layers[layer].count),
  });

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // camera + ambience loop. The camera ONLY eases toward what Alex set
  // via wheel/drag/buttons — nothing automatic (his explicit directive).
  // The ambience part arc-flashes one random filament every ~1.4s at rest.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const interactive = focusRef.current !== null || selRef.current !== null;
      const k = reduced ? 1 : smoothK(now - last, 120);
      last = now;
      const cur = camState.current;
      const tgt = camTarget.current;
      cur.x += (tgt.x - cur.x) * k;
      cur.y += (tgt.y - cur.y) * k;
      cur.s += (tgt.s - cur.s) * k;
      camRef.current?.setAttribute(
        'transform',
        `translate(${(W / 2 - cur.s * cur.x).toFixed(2)} ${(CY - cur.s * cur.y).toFixed(2)}) scale(${cur.s.toFixed(4)})`,
      );

      const flash = flashRef.current;
      if (!reduced && !interactive) {
        const bucket = Math.floor(now / 1400);
        if (bucket !== flash.bucket && leads.length > 0) {
          flash.el?.classList.remove('neural-flash');
          const pick = leads[Math.floor(rnd(bucket, 33) * leads.length)];
          flash.el = groupRefs.current.get(pick.id) ?? null;
          flash.el?.classList.add('neural-flash');
          flash.bucket = bucket;
          flash.until = now + 340;
        } else if (flash.el && now > flash.until) {
          flash.el.classList.remove('neural-flash');
          flash.el = null;
        }
      } else if (flash.el) {
        flash.el.classList.remove('neural-flash');
        flash.el = null;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [leads]);

  if (leads.length === 0) {
    return <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">No journeys for this filter yet.</p>;
  }

  /**
   * Hover is hit-tested in world space from the svg's own mousemove — never
   * from per-dot enter/leave. The camera centers the hovered neuron, which
   * moves it away from the cursor; element-hover would immediately fire a
   * leave and the camera would oscillate. Nearest-neuron search is stable.
   */
  const worldFromEvent = (e: React.MouseEvent): { x: number; y: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const cam = camState.current;
    return { x: (px - (W / 2 - cam.s * cam.x)) / cam.s, y: (py - (CY - cam.s * cam.y)) / cam.s };
  };

  const nearestNode = (w: { x: number; y: number }, radius: number): FocusNode | null => {
    let best: FocusNode | null = null;
    let bestD = radius * radius;
    for (const n of nodes) {
      const p = dotXY(n.layer, n.row);
      const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };

  /** Keep the visible window inside the canvas; identity when zoomed out. */
  const clampCam = (x: number, y: number, s: number) => ({
    x: Math.min(W - W / (2 * s), Math.max(W / (2 * s), x)),
    y: Math.min(H - H / (2 * s), Math.max(H / (2 * s), y)),
    s: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s)),
  });

  /** Wheel-zoom anchored at the cursor's world point — Alex's zoom. */
  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => {
    const tgt = camTarget.current;
    const s2 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, tgt.s * factor));
    if (anchor) {
      // keep the anchored world point at its current screen position
      const psx = tgt.s * (anchor.x - tgt.x) + W / 2;
      const psy = tgt.s * (anchor.y - tgt.y) + CY;
      camTarget.current = clampCam(anchor.x - (psx - W / 2) / s2, anchor.y - (psy - CY) / s2, s2);
    } else {
      camTarget.current = clampCam(tgt.x, tgt.y, s2);
    }
  };

  const onMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.active) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const s = camState.current.s;
      const dx = ((e.clientX - drag.lastX) / rect.width) * W;
      const dy = ((e.clientY - drag.lastY) / rect.height) * H;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      const next = clampCam(camTarget.current.x - dx / s, camTarget.current.y - dy / s, s);
      camTarget.current = next;
      camState.current = { ...next }; // 1:1 drag, no easing lag
      return;
    }
    const w = worldFromEvent(e);
    if (!w) return;
    // hit radius tracks zoom so grabbing feels the same at any scale
    const hit = nearestNode(w, 14 / camState.current.s);
    const cur = focusRef.current;
    if (hit) {
      if (cur?.leadId !== hit.leadId || cur?.layer !== hit.layer) {
        focusRef.current = hit;
        setFocus(hit);
      }
      return;
    }
    // hysteresis: hold focus while the cursor stays near the focused neuron
    if (cur) {
      const p = dotXY(cur.layer, cur.row);
      const release = 44 / camState.current.s;
      if ((p.x - w.x) ** 2 + (p.y - w.y) ** 2 < release * release) return;
      focusRef.current = null;
      setFocus(null);
    }
  };

  const onLeave = () => {
    dragRef.current.active = false;
    focusRef.current = null;
    setFocus(null);
  };

  const onDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: 0 };
  };

  const onUp = () => {
    dragRef.current.active = false;
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (dragRef.current.moved > 6) return; // that was a pan, not a click
    const w = worldFromEvent(e);
    const hit = focusRef.current ?? (w ? nearestNode(w, 14 / camState.current.s) : null);
    setSelNode((cur) => (hit ? (cur?.leadId === hit.leadId ? null : hit) : null));
  };

  // the burst anchors on the clicked neuron first, else the hovered one
  const anchor = selNode ?? focus;
  const anchorId = anchor?.leadId ?? null;
  const anchorLead = anchorId ? (leadById.get(anchorId) ?? null) : null;
  const selectedLead = selNode ? (leadById.get(selNode.leadId) ?? null) : null;

  const edgesByLead = new Map<string, typeof edges>();
  for (const e of edges) {
    const list = edgesByLead.get(e.leadId) ?? [];
    list.push(e);
    edgesByLead.set(e.leadId, list);
  }

  /** The Tesla burst: white filaments fanning to the neighboring cohort. */
  const burst = anchor
    ? (() => {
        const p = dotXY(anchor.layer, anchor.row);
        const fan: { d: string; o: number }[] = [];
        for (const dl of [-1, 1]) {
          const L = anchor.layer + dl;
          if (L < 0 || L >= layerCount) continue;
          const near = nodes
            .filter((n) => n.layer === L)
            .map((n) => ({ n, p: dotXY(n.layer, n.row) }))
            .sort((a, b) => Math.abs(a.p.y - p.y) - Math.abs(b.p.y - p.y))
            .slice(0, BURST_FAN);
          near.forEach((m, mi) => {
            fan.push({
              d: filamentPath(p.x, p.y, m.p.x, m.p.y, (rnd(mi * 3 + L, 41) - 0.5) * 30),
              o: 0.55 - (mi / BURST_FAN) * 0.42,
            });
          });
        }
        return { p, fan };
      })()
    : null;

  return (
    <div ref={rootRef} className="funnel-space-root neural-root relative overflow-hidden rounded-md-t">
      {/* camera controls — the only things that move the camera */}
      <div className="absolute right-1 top-1 z-20 flex items-center gap-1">
        <button
          onClick={() => zoomBy(1.35)}
          aria-label="Zoom in"
          className="rounded-sm-t border border-[#24335f] bg-[#0a1129] p-1.5 text-[#8fa0d0] transition-colors hover:border-[#3d4f8a] hover:text-[#dbe4ff]"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.35)}
          aria-label="Zoom out"
          className="rounded-sm-t border border-[#24335f] bg-[#0a1129] p-1.5 text-[#8fa0d0] transition-colors hover:border-[#3d4f8a] hover:text-[#dbe4ff]"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            camTarget.current = { x: W / 2, y: CY, s: 1 };
          }}
          aria-label="Reset view"
          className="rounded-sm-t border border-[#24335f] bg-[#0a1129] p-1.5 text-[#8fa0d0] transition-colors hover:border-[#3d4f8a] hover:text-[#dbe4ff]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void rootRef.current?.requestFullscreen();
          }}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="rounded-sm-t border border-[#24335f] bg-[#0a1129] p-1.5 text-[#8fa0d0] transition-colors hover:border-[#3d4f8a] hover:text-[#dbe4ff]"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Leads flowing through the funnel as a neural network"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onClick={onCanvasClick}
        style={{ cursor: dragRef.current.active ? 'grabbing' : anchor ? 'pointer' : 'grab' }}
      >
        <defs>
          <radialGradient id="neuralBg" cx="50%" cy="48%" r="72%">
            <stop offset="0%" stopColor={INK.bgCore} />
            <stop offset="55%" stopColor={INK.bgMid} />
            <stop offset="100%" stopColor={INK.bgEdge} />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#neuralBg)" />

        {/* starfield specks */}
        {Array.from({ length: 90 }, (_, i) => (
          <circle
            key={`st-${i}`}
            cx={rnd(i, 51) * W}
            cy={rnd(i, 52) * H}
            r={0.5 + rnd(i, 53) * 0.9}
            fill={INK.dot}
            opacity={0.12 + rnd(i, 54) * 0.3}
          />
        ))}

        {/* faint elliptical contours for depth */}
        {[0, 1, 2].map((c) => (
          <ellipse
            key={`ct-${c}`}
            cx={W / 2 + (c - 1) * 60}
            cy={CY}
            rx={340 + c * 150}
            ry={190 + c * 66}
            fill="none"
            stroke={INK.contour}
            strokeOpacity={0.28 - c * 0.07}
            transform={`rotate(${-8 + c * 7} ${W / 2} ${CY})`}
          />
        ))}

        <g ref={camRef}>
          {/* layer column frames */}
          {layers.map((l, i) => (
            <rect
              key={`fr-${l.name}`}
              x={layerX(i, layerCount) - 11}
              y={COL_TOP - 12}
              width={22}
              height={COL_BOTTOM - COL_TOP + 24}
              rx={3}
              fill="rgba(10, 17, 41, 0.3)"
              stroke={INK.frame}
              strokeOpacity={0.55}
            />
          ))}

          {/* labeled input gutter — top-likelihood leads, real touch sparklines */}
          {labeled.map((l, i) => {
            const pitch = Math.min(14, (COL_BOTTOM - COL_TOP) / Math.max(1, labeled.length - 1));
            const ly = (COL_TOP + COL_BOTTOM) / 2 - (pitch * (labeled.length - 1)) / 2 + i * pitch;
            const dot = dotXY(0, l.row);
            const sparkW = 16;
            const sx = GUTTER - sparkW - 6;
            return (
              <g
                key={`lb-${l.leadId}`}
                opacity={anchorId && anchorId !== l.leadId ? 0.15 : 1}
                style={{ transition: 'opacity 300ms ease' }}
              >
                <text x={sx - 4} y={ly + 2.5} textAnchor="end" fill={INK.label} fontSize={8} fontFamily="var(--font-mono)" style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {l.name.slice(0, 22)}
                </text>
                <polyline
                  points={l.spark.map((v, si) => `${sx + (si / Math.max(1, l.spark.length - 1)) * sparkW},${ly + 3 - v * 6}`).join(' ')}
                  fill="none"
                  stroke={INK.label}
                  strokeOpacity={0.75}
                  strokeWidth={0.8}
                />
                <line x1={GUTTER + 2} y1={ly} x2={dot.x - 4} y2={dot.y} stroke={INK.leader} strokeOpacity={0.4} strokeWidth={0.5} />
              </g>
            );
          })}

          {/* the web — one group per lead so focus isolates a whole path */}
          {leads.map((lead, li) => {
            const leadEdges = edgesByLead.get(lead.id) ?? [];
            const isAnchor = anchorId === lead.id;
            // the touched lead runs stark white; everyone else keeps their hue
            const color = isAnchor ? INK.white : HUE_COLOR[leadEdges[0]?.hue ?? 'yellow'];
            const dimmed = anchorId !== null && !isAnchor;
            return (
              <g
                key={lead.id}
                ref={(el) => {
                  if (el) groupRefs.current.set(lead.id, el);
                  else groupRefs.current.delete(lead.id);
                }}
                className="neural-lead"
                style={{ mixBlendMode: 'screen', transition: 'opacity 300ms ease, filter 260ms ease' }}
                opacity={dimmed ? (selNode ? 0.08 : 0.13) : 1}
              >
                {leadEdges.map((e, ei) => {
                  const a = dotXY(e.fromLayer, e.fromRow);
                  const b = dotXY(e.toLayer, e.toRow);
                  const d1 = strandPath(a.x, a.y, b.x, b.y, (rnd(li * 7 + ei, 21) - 0.5) * 26);
                  const d2 = strandPath(a.x, a.y, b.x, b.y, (rnd(li * 7 + ei, 22) - 0.5) * 34);
                  const fade = (1 - e.decay * 0.5) * (1 - e.fromLayer * 0.1);
                  const base = (0.05 + e.strength * 0.26) * fade;
                  return (
                    <g key={`${lead.id}-e${ei}`} style={{ pointerEvents: 'none' }}>
                      {/* wide radiating halo when isolated, then bloom + core */}
                      {isAnchor && <path d={d1} fill="none" stroke={color} strokeWidth={6} strokeOpacity={0.18} />}
                      <path d={d1} fill="none" stroke={color} strokeWidth={2.6} strokeOpacity={isAnchor ? 0.55 : base * 0.45} />
                      <path d={d1} fill="none" stroke={color} strokeWidth={isAnchor ? 1.2 : 0.7} strokeOpacity={isAnchor ? 0.95 : base} />
                      <path d={d2} fill="none" stroke={color} strokeWidth={0.55} strokeOpacity={isAnchor ? 0.8 : base * 0.7} />
                      {/* traveling spark — the plasma pulse riding this strand */}
                      <path
                        className="neural-pulse"
                        d={d1}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.4}
                        strokeOpacity={isAnchor ? 0.9 : Math.min(0.6, base * 2.4)}
                        strokeDasharray="3 46"
                        strokeLinecap="round"
                        style={{
                          animationDuration: `${(2.6 + rnd(li * 7 + ei, 24) * 2.8).toFixed(2)}s`,
                          animationDelay: `-${(rnd(li * 7 + ei, 25) * 5).toFixed(2)}s`,
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* the Tesla burst — white filaments fan to the neighboring cohort */}
          {burst && (
            <g style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
              {burst.fan.map((f, fi) => (
                <path key={`bf-${fi}`} d={f.d} fill="none" stroke={INK.white} strokeWidth={0.6} strokeOpacity={f.o} />
              ))}
              <circle cx={burst.p.x} cy={burst.p.y} r={7} fill="none" stroke={INK.white} strokeWidth={1.2} strokeOpacity={0.5} />
              <circle cx={burst.p.x} cy={burst.p.y} r={3.4} fill={INK.white} opacity={0.95} />
            </g>
          )}

          {/* neurons — hit-testing lives on the svg, so these stay inert */}
          {nodes.map((n) => {
            const { x, y } = dotXY(n.layer, n.row);
            const lead = leadById.get(n.leadId);
            if (!lead) return null;
            const isAnchor = anchorId === n.leadId;
            const dimmed = anchorId !== null && !isAnchor;
            return (
              <circle
                key={`${n.leadId}-n${n.layer}`}
                cx={x}
                cy={y}
                r={isAnchor ? 3.2 : 2}
                fill={
                  isAnchor
                    ? INK.white
                    : lead.state === 'converted' && n.layer === layerCount - 1
                      ? HUE_COLOR.green
                      : INK.dot
                }
                opacity={dimmed ? 0.15 : 0.92}
                style={{ pointerEvents: 'none', transition: 'opacity 300ms ease' }}
              />
            );
          })}

          {/* focused lead nameplate rides the zoom */}
          {anchorLead && (
            <text
              x={dotXY(0, 0).x}
              y={COL_TOP - 26}
              fill={INK.white}
              fontSize={11}
              fontFamily="var(--font-mono)"
              style={{ pointerEvents: 'none' }}
            >
              {anchorLead.name} · {anchorLead.likelihood}% · {anchorLead.daysSinceLastTouch}d quiet
            </text>
          )}
        </g>

        {/* idle sheen — one drifting highlight band, stilled for reduced motion */}
        <rect className="neural-sheen" width={W / 3} height={H} fill="#dbe4ff" opacity={0.035} style={{ mixBlendMode: 'screen', pointerEvents: 'none' }} />
      </svg>

      {/* floating layer cards */}
      <div className="pointer-events-none absolute inset-x-0 top-2 z-10 hidden sm:block">
        {layers.map((l, i) => (
          <div
            key={l.name}
            className="pointer-events-auto absolute rounded-sm-t border border-[#24335f] bg-[rgba(7,12,32,0.78)] px-2 py-1 font-mono text-[9px] leading-[1.5] text-[#8fa0d0] backdrop-blur-sm"
            // the OUTPUT card pins to the right edge so it never clips off-canvas
            style={i === layerCount - 1 ? { right: 40 } : { left: `calc(${(layerX(i, layerCount) / W) * 100}% - 44px)` }}
          >
            <div className="text-[9.5px] font-bold tracking-[0.14em] text-[#dbe4ff]">{l.name}</div>
            <div className="uppercase tracking-wide">{l.stageLabel}</div>
            <div>Neurons: {l.count}</div>
            <button
              onClick={() => setActivation((a) => a.map((v, ai) => (ai === i ? (v + 1) % ACTIVATIONS.length : v)))}
              className="text-[#ff5d5d] hover:underline"
            >
              Activation: {ACTIVATIONS[activation[i]]} (click)
            </button>
          </div>
        ))}
      </div>

      {selectedLead && <FunnelNodeCard node={selectedLead} onClose={() => setSelNode(null)} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-[#04060f] px-2 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-wide text-[#5c6c9c]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: HUE_COLOR.green }} /> hot momentum
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: HUE_COLOR.yellow }} /> warm / cold active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: HUE_COLOR.red }} /> stalled / decaying
        </span>
        <span>brightness = likelihood</span>
        <span className="ml-auto">scroll = zoom · drag = pan · hover = white burst (cohort) + its journey · click to pin</span>
      </div>
    </div>
  );
}
