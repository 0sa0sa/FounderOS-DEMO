import { describe, expect, test } from 'vitest';
import { pillarRadarAxes } from '@/lib/pillar-radar';
import type { Agent, AgentRun, Department, SopTask } from '@/lib/schemas';

const dept = (id: string, name: string, order: number): Department => ({
  id, name, slug: id, tagline: '', color: '#fff', order,
});
const agent = (id: string, departmentId: string, status: Agent['status']): Agent => ({
  id, departmentId, name: id, role: '', status, tier: 'worker', description: '',
  model: '', tools: [], parentId: null, instance: 'builtin',
});
const task = (id: string, departmentId: string): SopTask => ({
  id, departmentId, title: id, summary: '', steps: ['one one one', 'two two two', 'three three three'],
  assigneeKind: 'agent', assigneeId: id,
});
const run = (agentId: string, minutesAgo: number): AgentRun => ({
  id: `r-${agentId}`, agentId, startedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  finishedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), ok: true, summary: 'ok',
});

const departments = [dept('dept-sales', 'Sales', 1), dept('dept-tech', 'TECH', 2)];
const agents = [
  agent('s1', 'dept-sales', 'active'),
  agent('s2', 'dept-sales', 'active'),
  agent('t1', 'dept-tech', 'idle'),
  agent('t2', 'dept-tech', 'idle'),
];
const tasks = [task('s1', 'dept-sales'), task('t1', 'dept-tech')];

describe('pillarRadarAxes — per-pillar health for the spider chart', () => {
  test('one axis per department in graph order, scores in [15, 100]', () => {
    const axes = pillarRadarAxes(departments, agents, tasks, {});
    expect(axes.map((a) => a.id)).toEqual(['dept-sales', 'dept-tech']);
    for (const a of axes) {
      expect(a.score).toBeGreaterThanOrEqual(15);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  test('an all-active pillar with a fresh run outscores an idle one', () => {
    const axes = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 5) });
    const sales = axes.find((a) => a.id === 'dept-sales')!;
    const tech = axes.find((a) => a.id === 'dept-tech')!;
    expect(sales.score).toBeGreaterThan(tech.score);
  });

  test('recency tiers: a fresh run scores higher than a week-old one', () => {
    const fresh = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 30) });
    const stale = pillarRadarAxes(departments, agents, tasks, { s1: run('s1', 60 * 24 * 10) });
    expect(fresh.find((a) => a.id === 'dept-sales')!.score).toBeGreaterThan(
      stale.find((a) => a.id === 'dept-sales')!.score,
    );
  });

  test('deterministic for identical inputs', () => {
    const runs = { s1: run('s1', 30) };
    expect(pillarRadarAxes(departments, agents, tasks, runs)).toEqual(
      pillarRadarAxes(departments, agents, tasks, runs),
    );
  });
});
