'use client';

/**
 * Reference mock: project/task ops in the G-Brain Radial grammar. Operator hub
 * at the core, one sector per project on the inner ring, tasks fanned inside
 * their sector on the outer ring, colored by status. Click a project to focus
 * its sector (everything else recedes, the side panel scopes to it), click a
 * task — on the wheel or in the panel — to advance its status, add tasks from
 * the panel. State is local only, by design: this page demonstrates the
 * interaction model before it gets wired to the real agent_tasks repo.
 */
import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge, Label } from '@/components/terminal';
import {
  cycleStatus,
  demoProjects,
  polarPoint,
  projectAngles,
  projectProgress,
  sectorTaskAngles,
  STATUS_COLOR,
  STATUS_LABEL,
  type MockProject,
  type MockTaskStatus,
} from '@/lib/project-radial';

const W = 880;
const H = 600;
const CX = W / 2;
const CY = H / 2;
const R_PROJECT = 150;
const R_TASK = 250;
const SECTOR_SPREAD = 46; // degrees a project's task fan may occupy

export function ProjectRadial() {
  const [projects, setProjects] = useState<MockProject[]>(demoProjects);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const angles = useMemo(() => projectAngles(projects.length), [projects.length]);
  const focused = projects.find((p) => p.id === focusId) ?? null;

  const advance = (projectId: string, taskId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status: cycleStatus(t.status) } : t)) }
          : p,
      ),
    );
  };

  const addTask = () => {
    const title = draft.trim();
    if (!title || !focused) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === focused.id
          ? { ...p, tasks: [...p.tasks, { id: `new-${p.tasks.length}-${title.length}`, title, status: 'open' as const }] }
          : p,
      ),
    );
    setDraft('');
  };

  const dimmed = (projectId: string) => (focusId !== null && focusId !== projectId ? 0.16 : 1);

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* ── the wheel ─────────────────────────────────────────────────── */}
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm-t border border-os-border-strong bg-os-surface/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
          Reference mock · local state only
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Radial project and task wheel">
          {/* orbital guides */}
          <circle cx={CX} cy={CY} r={R_PROJECT} fill="none" stroke="var(--border)" strokeDasharray="2 7" />
          <circle cx={CX} cy={CY} r={R_TASK} fill="none" stroke="var(--border)" strokeDasharray="2 7" opacity="0.7" />

          {projects.map((p, i) => {
            const [px, py] = polarPoint(CX, CY, R_PROJECT, angles[i]);
            const taskAngles = sectorTaskAngles(angles[i], p.tasks.length, SECTOR_SPREAD);
            const progress = projectProgress(p.tasks);
            const arcR = 19;
            const arcC = 2 * Math.PI * arcR;
            return (
              <g key={p.id} opacity={dimmed(p.id)} style={{ transition: 'opacity 220ms' }}>
                {/* spoke: hub → project */}
                <line x1={CX} y1={CY} x2={px} y2={py} stroke={p.color} strokeWidth="1" opacity="0.28" />

                {/* tasks fanned inside the sector */}
                {p.tasks.map((t, j) => {
                  const [tx, ty] = polarPoint(CX, CY, R_TASK, taskAngles[j]);
                  return (
                    <g key={t.id} className="cursor-pointer" onClick={() => advance(p.id, t.id)}>
                      <line x1={px} y1={py} x2={tx} y2={ty} stroke="var(--border-strong)" strokeWidth="0.7" opacity="0.7" />
                      <circle cx={tx} cy={ty} r="10" fill="transparent" />
                      <circle cx={tx} cy={ty} r={t.status === 'doing' ? 5.5 : 4.5} fill={STATUS_COLOR[t.status]}>
                        <title>{`${t.title} — ${STATUS_LABEL[t.status]} (click to advance)`}</title>
                      </circle>
                      {t.status === 'doing' && (
                        <circle cx={tx} cy={ty} r="9" fill="none" stroke={STATUS_COLOR.doing} strokeWidth="0.8" opacity="0.45" />
                      )}
                    </g>
                  );
                })}

                {/* project node + progress arc */}
                <g
                  className="cursor-pointer"
                  onClick={() => setFocusId((cur) => (cur === p.id ? null : p.id))}
                >
                  <circle cx={px} cy={py} r={arcR} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1" />
                  <circle
                    cx={px}
                    cy={py}
                    r={arcR}
                    fill="none"
                    stroke={p.color}
                    strokeWidth="2.5"
                    strokeDasharray={`${progress * arcC} ${arcC}`}
                    transform={`rotate(-90 ${px} ${py})`}
                  />
                  <circle cx={px} cy={py} r="6" fill={p.color} opacity={focusId === p.id ? 1 : 0.8}>
                    <title>{`${p.name} — ${Math.round(progress * 100)}% done (click to focus)`}</title>
                  </circle>
                  <text
                    x={px}
                    y={py + arcR + 15}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize="9.5"
                    letterSpacing="1"
                    fill={focusId === p.id ? 'var(--text)' : 'var(--text-2)'}
                  >
                    {p.name.toUpperCase()}
                  </text>
                </g>
              </g>
            );
          })}

          {/* operator hub, above the spokes */}
          <g className="cursor-pointer" onClick={() => setFocusId(null)}>
            <circle cx={CX} cy={CY} r="26" fill="var(--surface)" stroke="var(--text)" strokeOpacity="0.5" strokeWidth="1" />
            <Sparkles x={CX - 8} y={CY - 8} width={16} height={16} color="var(--text)" strokeWidth={1.6} />
            <text x={CX} y={CY + 42} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" fill="var(--text-3)">
              MISSIONS
            </text>
          </g>
        </svg>

        {/* status legend */}
        <div className="flex items-center gap-4 border-t border-os-border px-3 py-2">
          {(Object.keys(STATUS_LABEL) as MockTaskStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-os-muted">
              <span className="inline-block h-2 w-2" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px] text-os-dim">click task = advance · click project = focus</span>
        </div>
      </div>

      {/* ── ops panel ─────────────────────────────────────────────────── */}
      <aside className="shrink-0 rounded-lg-t border border-os-border bg-os-surface p-3.5 lg:w-80">
        {focused ? (
          <>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label rule>{focused.name}</Label>
              <button
                onClick={() => setFocusId(null)}
                className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim hover:text-os-text"
              >
                all ✕
              </button>
            </div>
            <div className="mb-3 font-mono text-[10.5px] text-os-dim">
              {focused.tasks.filter((t) => t.status === 'done').length}/{focused.tasks.length} done ·{' '}
              {Math.round(projectProgress(focused.tasks) * 100)}%
            </div>
            <ul className="flex flex-col">
              {focused.tasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => advance(focused.id, t.id)}
                    className="flex w-full items-center gap-2.5 border-b border-os-hairline px-1 py-2 text-left text-[12.5px] text-os-muted transition-colors hover:bg-os-surface2 hover:text-os-text"
                    title="Click to advance status"
                  >
                    <span className="inline-block h-2 w-2 shrink-0" style={{ background: STATUS_COLOR[t.status] }} />
                    <span className={`min-w-0 flex-1 ${t.status === 'done' ? 'line-through opacity-55' : ''}`}>{t.title}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-os-dim">
                      {STATUS_LABEL[t.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addTask();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="add a task to this project…"
                className="min-w-0 flex-1 rounded-sm-t border border-os-border bg-transparent px-2.5 py-1.5 font-mono text-[11.5px] text-os-text outline-none placeholder:text-os-dim focus:border-os-border-strong"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="shrink-0 rounded-sm-t border border-os-border px-2.5 font-mono text-[11px] text-os-muted transition-colors hover:border-os-accent hover:text-os-accent disabled:opacity-40"
              >
                add
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-3">
              <Label rule>Projects</Label>
            </div>
            <ul className="flex flex-col">
              {projects.map((p) => {
                const done = p.tasks.filter((t) => t.status === 'done').length;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setFocusId(p.id)}
                      className="flex w-full items-center gap-2.5 border-b border-os-hairline px-1 py-2.5 text-left text-[12.5px] text-os-muted transition-colors hover:bg-os-surface2 hover:text-os-text"
                    >
                      <span className="inline-block h-2 w-2 shrink-0" style={{ background: p.color }} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-os-dim">
                        {done}/{p.tasks.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3">
              <Badge ghost>focus a project to manage its tasks</Badge>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
