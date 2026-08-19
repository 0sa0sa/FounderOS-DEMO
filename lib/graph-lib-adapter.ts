import { useEffect, useRef, useState } from 'react';
import type { KGNodeKind, KnowledgeGraph as KGData } from '@/lib/knowledge-graph';

/**
 * Shared conversion + theming for the /brain "library showdown" tabs
 * (components/graph-libs/*). Every library wants a slightly different shape
 * for the same nodes/edges, so this stays a flat, library-agnostic source
 * of truth instead of six copies of the same mapping.
 */

export type FlatNode = { id: string; label: string; kind: KGNodeKind; ring: number };
export type FlatLink = { source: string; target: string };
export type FlatGraph = { nodes: FlatNode[]; links: FlatLink[] };

export function toFlatGraph(graph: KGData): FlatGraph {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, ring: n.ring })),
    links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
  };
}

const KIND_COLOR_VAR: Record<KGNodeKind, string> = {
  self: '--text',
  team: '--brain-1',
  board: '--text',
  task: '--muted',
  person: '--warn',
  employee: '--accent',
  tool: '--kg-tool',
};

// Canvas/WebGL contexts can't resolve `var(--x)` themselves, so these are the
// values read back from the live theme — with dark-theme-shaped fallbacks for
// the brief window before mount (or if a var is ever missing).
const KIND_COLOR_FALLBACK: Record<KGNodeKind, string> = {
  self: '#f2f2f2',
  team: '#7dd3fc',
  board: '#f2f2f2',
  task: '#8fa295',
  person: '#ffb000',
  employee: '#2fd36f',
  tool: '#54665b',
};

export function resolveVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function resolveKindColor(kind: KGNodeKind): string {
  return resolveVar(KIND_COLOR_VAR[kind], KIND_COLOR_FALLBACK[kind]);
}

/**
 * Most of the library-showdown engines (canvas/WebGL) want explicit pixel
 * dimensions, not `100%` — this is the one bit of plumbing all six share.
 */
export function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export const KIND_LABEL: Record<KGNodeKind, string> = {
  self: 'Obsidian',
  team: 'Pillar',
  board: 'Board agent',
  task: 'SOP task',
  person: 'Human',
  employee: 'AI agent',
  tool: 'Tool',
};
