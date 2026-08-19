'use client';

import { useMemo } from 'react';
import Graph from 'react-vis-network-graph';
import { resolveKindColor, resolveVar, useContainerSize, type FlatGraph } from '@/lib/graph-lib-adapter';

export function VisNetworkReactView({ graph }: { graph: FlatGraph }) {
  const [ref, { width, height }] = useContainerSize<HTMLDivElement>();
  const ready = width > 0 && height > 0;

  // The wrapper re-mounts the underlying vis-network Network whenever these
  // prop identities change, so both must stay memoized to avoid a remount loop.
  const visGraph = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        color: resolveKindColor(n.kind),
        font: { color: resolveVar('--text-2', '#8fa295'), face: 'JetBrains Mono' },
      })),
      edges: graph.links.map((e) => ({
        from: e.source,
        to: e.target,
        color: resolveVar('--border-strong', '#243029'),
      })),
    }),
    [graph],
  );

  const options = useMemo(
    () => ({
      autoResize: true,
      height: `${height}px`,
      width: `${width}px`,
      physics: { stabilization: true },
      nodes: { shape: 'dot', size: 6 },
      interaction: { hover: true },
    }),
    [width, height],
  );

  return (
    <div
      ref={ref}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        react-vis-network-graph
      </div>
      {ready && <Graph graph={visGraph} options={options} style={{ width: '100%', height: '100%' }} />}
    </div>
  );
}
