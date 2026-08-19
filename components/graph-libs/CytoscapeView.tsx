'use client';

import { useMemo } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape, { type ElementDefinition, type StylesheetStyle } from 'cytoscape';
import { resolveKindColor, resolveVar, useContainerSize, type FlatGraph } from '@/lib/graph-lib-adapter';

export function CytoscapeView({ graph }: { graph: FlatGraph }) {
  const [ref, { width, height }] = useContainerSize<HTMLDivElement>();
  const ready = width > 0 && height > 0;

  const elements = useMemo<ElementDefinition[]>(
    () => [
      ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind } })),
      ...graph.links.map((e) => ({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target } })),
    ],
    [graph],
  );

  // Stylesheet reads live theme vars, so it must be built client-side (post-mount).
  const stylesheet = useMemo<StylesheetStyle[]>(
    () => [
      {
        selector: 'node',
        style: {
          'background-color': (ele: cytoscape.NodeSingular) => resolveKindColor(ele.data('kind')),
          label: 'data(label)',
          'font-size': 6,
          color: resolveVar('--text-2', '#8fa295'),
          // cytoscape paints labels to canvas, so `var(--font-mono)` (fine in
          // real CSS) resolves to nothing — it needs the actual font stack.
          'font-family': '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
          width: 12,
          height: 12,
        },
      },
      {
        selector: 'edge',
        style: {
          'line-color': resolveVar('--border-strong', '#243029'),
          width: 1,
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
        },
      },
    ],
    [ready],
  );

  return (
    <div
      ref={ref}
      className="relative h-full min-h-[480px] w-full overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
        Cytoscape.js v3.34
      </div>
      {ready && (
        <CytoscapeComponent
          elements={elements}
          style={{ width, height }}
          layout={{ name: 'cose', animate: false }}
          stylesheet={stylesheet}
        />
      )}
    </div>
  );
}
