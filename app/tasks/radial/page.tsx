import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ProjectRadial } from '@/components/ProjectRadial';

export const dynamic = 'force-dynamic';

/**
 * Reference mock: the G-Brain Radial grammar applied to project/task ops.
 * Interaction model only (local state) — the real wiring target is the
 * agent_tasks repo behind /tasks.
 */
export default function RadialTasksPage() {
  return (
    <div>
      <PageHeader
        eyebrow="reference mock · radial ops"
        title="Task Wheel"
        right={
          <Link
            href="/tasks"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-os-dim transition-colors hover:text-os-accent"
          >
            board view →
          </Link>
        }
      />
      <ProjectRadial />
    </div>
  );
}
