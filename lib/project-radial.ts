/**
 * Project/task ops in the G-Brain Radial grammar — pure data + layout math for
 * the /tasks/radial reference mock. The wheel: operator hub at the core,
 * projects on ring 1 (one sector each), their tasks fanned inside that sector
 * on ring 2, colored by status. Component state is throwaway (it's a mock);
 * everything testable lives here.
 */

export type MockTaskStatus = 'open' | 'doing' | 'done';

export type MockTask = {
  id: string;
  title: string;
  status: MockTaskStatus;
};

export type MockProject = {
  id: string;
  name: string;
  /** CSS color (var(--…) ok) — the sector tint, like life-area colors on /brain. */
  color: string;
  tasks: MockTask[];
};

/** Evenly spaced project angles in degrees, first sector at 12 o'clock. */
export function projectAngles(count: number): number[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => -90 + (i * 360) / count);
}

/**
 * Fan a project's tasks inside its sector: centered on the project angle,
 * spread across at most `spreadDeg` degrees (half the sector reads clean).
 */
export function sectorTaskAngles(projectAngle: number, taskCount: number, spreadDeg: number): number[] {
  if (taskCount <= 0) return [];
  if (taskCount === 1) return [projectAngle];
  const step = spreadDeg / (taskCount - 1);
  const start = projectAngle - spreadDeg / 2;
  return Array.from({ length: taskCount }, (_, i) => start + i * step);
}

/** Degrees → canvas [x, y] (0° = 3 o'clock, -90° = 12 o'clock). */
export function polarPoint(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Done fraction for the project's progress arc; empty project reads 0. */
export function projectProgress(tasks: MockTask[]): number {
  if (tasks.length === 0) return 0;
  return tasks.filter((t) => t.status === 'done').length / tasks.length;
}

const CYCLE: Record<MockTaskStatus, MockTaskStatus> = { open: 'doing', doing: 'done', done: 'open' };

/** One click on a task node advances it: open → doing → done → open. */
export function cycleStatus(status: MockTaskStatus): MockTaskStatus {
  return CYCLE[status];
}

export const STATUS_COLOR: Record<MockTaskStatus, string> = {
  open: 'var(--text-3)',
  doing: 'var(--warn)',
  done: 'var(--ok)',
};

export const STATUS_LABEL: Record<MockTaskStatus, string> = {
  open: 'To do',
  doing: 'In progress',
  done: 'Done',
};

/** Seeded demo wheel — same universe as the rest of the OS, mixed states. */
export function demoProjects(): MockProject[] {
  return [
    {
      id: 'proj-cohort',
      name: 'Launchpad Cohort Q3',
      color: 'var(--brain-1)',
      tasks: [
        { id: 'lc-1', title: 'Lock the webinar funnel copy', status: 'done' },
        { id: 'lc-2', title: 'Wire WebinarJam registrants into /funnel', status: 'doing' },
        { id: 'lc-3', title: 'Draft the 5-email nurture series', status: 'doing' },
        { id: 'lc-4', title: 'Price the payment-plan tier', status: 'open' },
        { id: 'lc-5', title: 'Rehearse the pitch close', status: 'open' },
      ],
    },
    {
      id: 'proj-gbrain',
      name: 'G-Brain v0.5',
      color: 'var(--brain-2)',
      tasks: [
        { id: 'gb-1', title: 'Re-embed the brain-store after the schema move', status: 'done' },
        { id: 'gb-2', title: 'Ship hybrid query to the Conductor', status: 'doing' },
        { id: 'gb-3', title: 'Doctor check for stale ZeroEntropy chunks', status: 'open' },
        { id: 'gb-4', title: 'Nightly capture digest into /comms', status: 'open' },
      ],
    },
    {
      id: 'proj-content',
      name: 'Content Engine',
      color: 'var(--brain-3)',
      tasks: [
        { id: 'ce-1', title: 'Batch 12 short-form cuts from the Q&A call', status: 'done' },
        { id: 'ce-2', title: 'Publish the six-platform pipeline doc', status: 'done' },
        { id: 'ce-3', title: 'A/B the DM-funnel hook on Reels', status: 'doing' },
        { id: 'ce-4', title: 'Refill the idea backlog to 30', status: 'open' },
      ],
    },
    {
      id: 'proj-finance',
      name: 'Finance Close · July',
      color: 'var(--warn)',
      tasks: [
        { id: 'fc-1', title: 'Reconcile Stripe vs PayKit payouts', status: 'done' },
        { id: 'fc-2', title: 'Flag the two disputed FlexPay charges', status: 'doing' },
        { id: 'fc-3', title: 'Book the contractor invoices', status: 'open' },
      ],
    },
    {
      id: 'proj-clients',
      name: 'Client Onboarding Rev',
      color: 'var(--accent)',
      tasks: [
        { id: 'co-1', title: 'Rewrite the kickoff checklist as an SOP', status: 'done' },
        { id: 'co-2', title: 'Automate the welcome sequence in GHL', status: 'open' },
        { id: 'co-3', title: 'Roster sync from Attio into /brain', status: 'open' },
      ],
    },
  ];
}
