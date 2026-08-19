'use client';

import { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { resolveKindColor, resolveVar, useContainerSize, type FlatGraph } from '@/lib/graph-lib-adapter';

export function VisNetworkVanillaView({ graph }: { graph: FlatGraph }) {
  const [containerRef, { width, height }] = useContainerSize<HTMLDivElement>();
  // vis-network clears its mount element's children on init, so it gets its
  // own div — sharing containerRef with the badge would wipe the badge out
  // from under React the moment the Network is constructed.
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || width === 0 || height === 0) return;

    const edgeColor = resolveVar('--border-strong', '#243029');
    const nodes = new DataSet(
      graph.nodes.map((n) => ({ id: n.id, label: n.label, color: resolveKindColor(n.kind) })),
    );
    const edges = new DataSet(
      graph.links.map((e, i) => ({ id: i, from: e.source, to: e.target, color: edgeColor })),
    );

    const network = new Network(
      el,
      { nodes, edges },
      {
        autoResize: true,
        physics: { stabilization: true },
        nodes: { shape: 'dot', size: 6, font: { color: resolveVar('--text-2', '#8fa295') } },
      },
    );

    return () => network.destroy();
  }, [graph, width, height]);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        vis-network (vanilla)
      </div>
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}
