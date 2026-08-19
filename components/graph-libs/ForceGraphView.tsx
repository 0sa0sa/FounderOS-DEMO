'use client';

import ForceGraph2D from 'react-force-graph-2d';
import { resolveKindColor, resolveVar, useContainerSize, type FlatGraph } from '@/lib/graph-lib-adapter';

export function ForceGraphView({ graph }: { graph: FlatGraph }) {
  const [ref, { width, height }] = useContainerSize<HTMLDivElement>();
  const ready = width > 0 && height > 0;

  return (
    <div
      ref={ref}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        react-force-graph-2d v1.29
      </div>
      {ready && (
        <ForceGraph2D
          graphData={{ nodes: graph.nodes, links: graph.links } as any}
          width={width}
          height={height}
          backgroundColor={resolveVar('--surface', '#0a0f0c')}
          nodeLabel={(n: any) => n.label}
          nodeColor={(n: any) => resolveKindColor(n.kind)}
          linkColor={() => resolveVar('--border-strong', '#243029')}
          nodeRelSize={5}
        />
      )}
    </div>
  );
}
