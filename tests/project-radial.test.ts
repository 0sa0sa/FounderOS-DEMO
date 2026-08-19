import { describe, expect, it } from 'vitest';
import {
  cycleStatus,
  demoProjects,
  polarPoint,
  projectAngles,
  projectProgress,
  sectorTaskAngles,
  type MockTask,
} from '@/lib/project-radial';

describe('project radial layout', () => {
  it('spaces N projects evenly around the wheel, first at 12 o\'clock', () => {
    const angles = projectAngles(4);
    expect(angles).toHaveLength(4);
    expect(angles[0]).toBe(-90);
    expect(angles[1] - angles[0]).toBeCloseTo(90);
    expect(angles[3] - angles[2]).toBeCloseTo(90);
  });

  it('fans a project\'s tasks inside its own sector, centered on the project angle', () => {
    const taskAngles = sectorTaskAngles(-90, 3, 48);
    expect(taskAngles).toHaveLength(3);
    // centered: mean equals the project angle
    const mean = taskAngles.reduce((s, a) => s + a, 0) / taskAngles.length;
    expect(mean).toBeCloseTo(-90);
    // stays inside the sector spread
    for (const a of taskAngles) {
      expect(Math.abs(a - -90)).toBeLessThanOrEqual(24);
    }
  });

  it('a single task sits exactly on the project angle', () => {
    expect(sectorTaskAngles(45, 1, 48)).toEqual([45]);
  });

  it('polarPoint converts degrees to canvas coordinates', () => {
    const [x, y] = polarPoint(100, 100, 50, -90);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(50);
  });

  it('progress is the done fraction, and 0 for an empty project', () => {
    const tasks: MockTask[] = [
      { id: 't1', title: 'a', status: 'done' },
      { id: 't2', title: 'b', status: 'doing' },
      { id: 't3', title: 'c', status: 'open' },
      { id: 't4', title: 'd', status: 'done' },
    ];
    expect(projectProgress(tasks)).toBeCloseTo(0.5);
    expect(projectProgress([])).toBe(0);
  });

  it('status cycles open → doing → done → open', () => {
    expect(cycleStatus('open')).toBe('doing');
    expect(cycleStatus('doing')).toBe('done');
    expect(cycleStatus('done')).toBe('open');
  });

  it('demo seed ships several projects, each with tasks in mixed states', () => {
    const projects = demoProjects();
    expect(projects.length).toBeGreaterThanOrEqual(4);
    for (const p of projects) {
      expect(p.tasks.length).toBeGreaterThan(0);
    }
    const statuses = new Set(projects.flatMap((p) => p.tasks.map((t) => t.status)));
    expect(statuses.has('open')).toBe(true);
    expect(statuses.has('doing')).toBe(true);
    expect(statuses.has('done')).toBe(true);
  });
});
