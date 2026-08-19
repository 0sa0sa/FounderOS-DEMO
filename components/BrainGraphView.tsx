'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type ComponentProps } from 'react';
import type { KnowledgeGraph as KnowledgeGraphType } from '@/components/KnowledgeGraph';
import { toFlatGraph } from '@/lib/graph-lib-adapter';

/**
 * The two graph engines are the heaviest client bundles in the app
 * (KnowledgeGraph alone is ~114KB of source pulling d3-force). They load
 * lazily, client-only, behind dimension-matched skeletons so /brain's first
 * paint ships without them and nothing shifts when they hydrate.
 */
const KnowledgeGraph = dynamic(() => import('@/components/KnowledgeGraph').then((m) => m.KnowledgeGraph), {
  ssr: false,
  loading: () => (
    // mirrors the graph's settled footprint: 680px canvas + directory aside
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="h-[680px] min-w-0 flex-1 animate-pulse rounded-lg-t border border-os-border bg-os-surface" />
      <div className="hidden shrink-0 rounded-lg-t border border-os-border bg-os-surface lg:block lg:h-[680px] lg:w-72" />
    </div>
  ),
});

const NeuralGraph = dynamic(() => import('@/components/NeuralGraph').then((m) => m.NeuralGraph), {
  ssr: false,
  loading: () => (
    // the neural canvas renders at its viewBox aspect (1200 / 640), full width
    <div
      className="w-full animate-pulse overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
      style={{ aspectRatio: '1200 / 640' }}
    />
  ),
});

// The "library showdown": the same node/edge data reproduced through six
// off-the-shelf graph packages, for comparison against the hand-rolled
// Radial/Neural engines above. Each is the heaviest possible bundle for its
// library (canvas, WebGL, or a full physics engine), so all six stay behind
// ssr:false + a skeleton exactly like Radial/Neural.
const LIB_SKELETON = (
  <div className="flex h-full min-h-[480px] w-full animate-pulse items-center justify-center rounded-lg-t border border-os-border bg-os-surface font-mono text-[10.5px] uppercase tracking-[0.14em] text-os-dim">
    loading engine…
  </div>
);

const ForceGraphView = dynamic(() => import('@/components/graph-libs/ForceGraphView').then((m) => m.ForceGraphView), {
  ssr: false,
  loading: () => LIB_SKELETON,
});
const CytoscapeView = dynamic(() => import('@/components/graph-libs/CytoscapeView').then((m) => m.CytoscapeView), {
  ssr: false,
  loading: () => LIB_SKELETON,
});
const SigmaView = dynamic(() => import('@/components/graph-libs/SigmaView').then((m) => m.SigmaView), {
  ssr: false,
  loading: () => LIB_SKELETON,
});
const VisNetworkReactView = dynamic(
  () => import('@/components/graph-libs/VisNetworkReactView').then((m) => m.VisNetworkReactView),
  { ssr: false, loading: () => LIB_SKELETON },
);
const VisNetworkVanillaView = dynamic(
  () => import('@/components/graph-libs/VisNetworkVanillaView').then((m) => m.VisNetworkVanillaView),
  { ssr: false, loading: () => LIB_SKELETON },
);
const ThreeGraphView = dynamic(() => import('@/components/graph-libs/ThreeGraphView').then((m) => m.ThreeGraphView), {
  ssr: false,
  loading: () => LIB_SKELETON,
});

const LIB_VIEWS = [
  { id: 'force-graph', label: 'react-force-graph' },
  { id: 'cytoscape', label: 'Cytoscape.js' },
  { id: 'sigma', label: 'Sigma.js' },
  { id: 'vis-react', label: 'react-vis-network-graph' },
  { id: 'vis-vanilla', label: 'vis-network' },
  { id: 'three', label: 'three.js' },
] as const;

type LibViewId = (typeof LIB_VIEWS)[number]['id'];

/**
 * View switch for the /brain knowledge graph: the hand-rolled Radial (default)
 * and Neural engines, plus a "library showdown" row reproducing the same
 * graph through six off-the-shelf packages — see LIB_VIEWS.
 */
export function BrainGraphView({ fill, ...props }: ComponentProps<typeof KnowledgeGraphType>) {
  const [view, setView] = useState<'radial' | 'neural' | LibViewId>('radial');
  const flat = useMemo(() => toFlatGraph(props.graph), [props.graph]);

  const libView = LIB_VIEWS.find((v) => v.id === view);

  return (
    <div className={fill ? 'flex h-full flex-col' : undefined}>
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1">
        {(
          [
            { id: 'radial', label: 'Radial' },
            { id: 'neural', label: 'Neural' },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded-sm-t border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
              view === v.id
                ? 'border-os-accent text-os-accent'
                : 'border-os-border text-os-dim hover:text-os-muted'
            }`}
            aria-pressed={view === v.id}
          >
            {v.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-os-border" aria-hidden />
        {LIB_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            title={`Reproduced with ${v.label}`}
            className={`rounded-sm-t border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
              view === v.id
                ? 'border-os-accent text-os-accent'
                : 'border-os-border text-os-dim hover:text-os-muted'
            }`}
            aria-pressed={view === v.id}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className={fill ? 'min-h-0 flex-1' : undefined}>
        {view === 'radial' && <KnowledgeGraph fill={fill} {...props} />}
        {view === 'neural' && (
          <NeuralGraph
            graph={props.graph}
            agents={props.agents}
            departments={props.departments}
            people={props.people}
            tasks={props.tasks}
            runsByAgent={props.runsByAgent}
          />
        )}
        {libView?.id === 'force-graph' && <ForceGraphView graph={flat} />}
        {libView?.id === 'cytoscape' && <CytoscapeView graph={flat} />}
        {libView?.id === 'sigma' && <SigmaView graph={flat} />}
        {libView?.id === 'vis-react' && <VisNetworkReactView graph={flat} />}
        {libView?.id === 'vis-vanilla' && <VisNetworkVanillaView graph={flat} />}
        {libView?.id === 'three' && <ThreeGraphView graph={flat} />}
      </div>
    </div>
  );
}
