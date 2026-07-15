'use client';

import { useState, type ComponentProps } from 'react';
import { KnowledgeGraph } from '@/components/KnowledgeGraph';
import { NeuralGraph } from '@/components/NeuralGraph';

/**
 * View switch for the /brain knowledge graph: the radial six-pillar wheel
 * (default) or the horizontal neural-network projection of the same data.
 */
export function BrainGraphView(props: ComponentProps<typeof KnowledgeGraph>) {
  const [view, setView] = useState<'radial' | 'neural'>('radial');
  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
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
      </div>
      {view === 'radial' ? (
        <KnowledgeGraph {...props} />
      ) : (
        <NeuralGraph
          graph={props.graph}
          agents={props.agents}
          departments={props.departments}
          people={props.people}
          tasks={props.tasks}
          runsByAgent={props.runsByAgent}
        />
      )}
    </div>
  );
}
