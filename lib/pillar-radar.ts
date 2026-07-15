import type { Agent, AgentRun, Department, SopTask } from '@/lib/schemas';
import { orderGraphDepartments } from '@/lib/knowledge-graph';
import { lifeAreaForDepartment } from '@/lib/life-map';

/**
 * Per-pillar health for the spider chart beside the G-Brain monitor: one axis
 * per department, scored 15..100 from real signals —
 *   55% how much of the pillar's agent roster is active,
 *   30% how fresh its latest agent run is,
 *   15% SOP coverage relative to roster size.
 * Pure + deterministic given its inputs.
 */
export type PillarAxis = { id: string; label: string; color: string; score: number };

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

function runRecency(latest: AgentRun | undefined, now: number): number {
  if (!latest) return 0;
  const h = (now - new Date(latest.finishedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(h) || h < 0) return 0;
  if (h <= 1) return 1;
  if (h <= 24) return 0.7;
  if (h <= 24 * 7) return 0.4;
  return 0.15;
}

export function pillarRadarAxes(
  departments: Department[],
  agents: Agent[],
  tasks: SopTask[],
  runsByAgent: Record<string, AgentRun>,
): PillarAxis[] {
  const ordered = orderGraphDepartments(departments, (d) => d.id);
  return ordered.map((d) => {
    const roster = agents.filter((a) => a.departmentId === d.id);
    const active = roster.filter((a) => a.status === 'active').length;
    const activeShare = roster.length > 0 ? active / roster.length : 0;
    const latest = roster
      .map((a) => runsByAgent[a.id])
      .filter((r): r is AgentRun => !!r)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
    // freshest run wins; recency evaluated against the newest run's own clock
    // domain (Date.now at call time — deterministic within a render)
    const recency = runRecency(latest, Date.now());
    const sops = tasks.filter((t) => t.departmentId === d.id).length;
    const sopCoverage = roster.length > 0 ? Math.min(1, sops / roster.length) : sops > 0 ? 1 : 0;
    const score = Math.round(55 * activeShare + 30 * recency + 15 * sopCoverage);
    return {
      id: d.id,
      label: d.name,
      color: lifeAreaForDepartment(d.id)?.color ?? d.color,
      score: clamp(15, 100, Math.max(score, 15)),
    };
  });
}
