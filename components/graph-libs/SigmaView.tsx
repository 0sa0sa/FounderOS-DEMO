'use client';

import { useEffect, useRef } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import { resolveKindColor, resolveVar, useContainerSize, type FlatGraph } from '@/lib/graph-lib-adapter';

export function SigmaView({ graph }: { graph: FlatGraph }) {
  const [ref, { width, height }] = useContainerSize<HTMLDivElement>();
  const rendererRef = useRef<Sigma | null>(null);
  const ready = width > 0 && height > 0;

  useEffect(() => {
    const container = ref.current;
    if (!container || !ready) return;

    const g = new Graph();
    for (const n of graph.nodes) {
      g.addNode(n.id, {
        label: n.label,
        size: 5,
        color: resolveKindColor(n.kind),
        x: Math.random(),
        y: Math.random(),
      });
    }
    for (const e of graph.links) {
      if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.source, e.target)) {
        g.addEdge(e.source, e.target, { color: resolveVar('--border-strong', '#243029'), size: 1 });
      }
    }
    forceAtlas2.assign(g, { iterations: 100, settings: forceAtlas2.inferSettings(g) });

    const renderer = new Sigma(g, container, {
      renderLabels: true,
      defaultNodeColor: resolveVar('--accent', '#2fd36f'),
      labelColor: { color: resolveVar('--text-2', '#8fa295') },
    });
    rendererRef.current = renderer;

    return () => {
      renderer.kill();
      rendererRef.current = null;
    };
    // Only rebuild when the graph data itself changes; `ready` gates the
    // first mount so Sigma never initializes into a 0×0 container.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, ready]);

  return (
    <div
      ref={ref}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        Sigma.js v3 (WebGL)
      </div>
    </div>
  );
}
