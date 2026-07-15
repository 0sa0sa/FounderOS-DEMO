import Link from 'next/link';
import { ArrowUpRight, Zap } from 'lucide-react';
import { getDb } from '@/lib/data';
import { allConnectorStatuses } from '@/lib/connectors';
import { createGBrainProvider } from '@/lib/connectors/gbrain';
import { audienceSeries, PLATFORM_COLORS, PLATFORM_LABELS } from '@/lib/social';
import { syncFromZernioLive } from '@/lib/social-live';
import { zernioPostDays } from '@/lib/connectors/zernio';
import { postSeriesFromDays } from '@/lib/posting-activity';
import type { SocialPlatform } from '@/lib/schemas';
import { gatherCommsFeed } from '@/lib/comms-feed';
import { inboundLast24h } from '@/lib/comms';
import { groupRoadmapByQuarter } from '@/lib/roadmap';
import { PageHeader } from '@/components/PageHeader';
import { HomeSocialGraph } from '@/components/HomeSocialGraph';
import { Badge, Dot, Kbd, Label, SectionHead, Spark } from '@/components/terminal';

export const dynamic = 'force-dynamic';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Clickable pulse tile that routes to its detail page. */
function StatTile({
  href,
  label,
  value,
  unit,
  spark,
  valueClass = '',
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  unit: string;
  spark: number[];
  valueClass?: string;
}) {
  return (
    <Link
      href={href}
      className="hoverable group flex flex-col gap-2 rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4"
    >
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <ArrowUpRight className="h-3.5 w-3.5 text-os-dim opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className={`flex items-baseline gap-[7px] font-mono text-[26px] font-semibold tracking-[-0.02em] ${valueClass}`}>
        {value}
        <small className="whitespace-nowrap text-xs font-normal text-os-dim">{unit}</small>
      </div>
      <Spark data={spark} />
    </Link>
  );
}

export default async function HomePage() {
  const db = getDb();
  // Live follower sync from Zernio/Late (falls back to static config on API
  // failure) — parity with /social so the home figures are real-time too.
  // It rides the same Promise.all as the other fetches: it still finishes
  // before the db reads below, but a cold render costs max(fetches) instead
  // of sync + max(fetches) — the paused-Supabase doctor alone was pushing the
  // console past 20s.
  const [connections, overview, feed, postDays] = await Promise.all([
    allConnectorStatuses(),
    createGBrainProvider().overview(),
    gatherCommsFeed(),
    zernioPostDays(),
    syncFromZernioLive(db),
  ]).then(([c, o, f, p]) => [c, o, f, p] as const);

  const agents = db.agents.all();
  const departments = new Map(db.departments.all().map((d) => [d.id, d.name]));
  const recentRuns = db.agentRuns.recent(40);
  const lastRunByAgent = new Map<string, (typeof recentRuns)[number]>();
  for (const r of recentRuns) if (!lastRunByAgent.has(r.agentId)) lastRunByAgent.set(r.agentId, r);

  const connected = connections.filter((c) => c.state === 'connected').length;
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const health = overview.doctor.healthScore;
  const inbound = inboundLast24h(feed);
  const runCount = recentRuns.length;
  const { channels, all } = audienceSeries(db);
  // Real per-platform posting from Zernio history (cross-posts counted per
  // platform), decorated with the brand palette HomeSocialGraph expects.
  const TRACKED: SocialPlatform[] = ['instagram', 'tiktok', 'twitter', 'youtube', 'linkedin'];
  const today = new Date().toISOString().slice(0, 10);
  const posting = postSeriesFromDays(postDays, today, 90, TRACKED).map((s) => ({
    ...s,
    label: PLATFORM_LABELS[s.key as SocialPlatform],
    color: PLATFORM_COLORS[s.key as SocialPlatform],
  }));

  const nowQuarter = groupRoadmapByQuarter(db.roadmap.all())[0];
  const nowItems = nowQuarter?.items.slice(0, 5) ?? [];

  // Ticker line items — newest agent runs, honest OK / FAIL.
  const ticker = recentRuns.slice(0, 8);

  return (
    <div>
      {/* self-contained marquee — no globals.css dependency */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes os-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.os-ticker-track { display: flex; width: max-content; animation: os-ticker 38s linear infinite; }
@media (prefers-reduced-motion: reduce) { .os-ticker-track { animation: none; } }`,
        }}
      />

      <PageHeader
        eyebrow="operator console"
        title={`${greeting()}, Alex`}
        caret
        right={
          <>
            <Badge tone="ok">● all nominal</Badge>
            <Kbd>⌘K</Kbd>
          </>
        }
      />

      {/* Pulse row */}
      <section className="mb-[18px] grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
        <StatTile
          href="/integrations"
          label="Systems"
          value={connected}
          unit={`/ ${connections.length} connected`}
          spark={[4, 5, 5, 6, 6, Math.max(0, connected - 1), connected]}
        />
        <StatTile
          href="/agents"
          label="Agents live"
          value={activeAgents}
          unit={`/ ${agents.length} roster`}
          spark={[1, 1, 2, 2, 3, Math.max(0, activeAgents - 1), activeAgents]}
        />
        <StatTile
          href="/comms"
          label="Communications"
          value={inbound}
          unit="inbound · 24h"
          spark={[2, 4, 3, 6, 5, Math.max(0, inbound - 1), inbound]}
        />
        <StatTile
          href="/brain"
          label="G-Brain health"
          value={health ?? '—'}
          unit={`/ 100${overview.doctor.connected ? ` · ${overview.doctor.status}` : ' · offline'}`}
          valueClass="text-os-accent"
          spark={[82, 85, 88, 86, 89, health ?? 90, health ?? 90]}
        />
      </section>

      {/* Live ticker */}
      <section className="mb-[22px] relative overflow-hidden rounded-md-t border border-os-border bg-os-surface">
        <div className="absolute inset-y-0 left-0 z-[2] flex items-center gap-[7px] border-r border-os-border bg-os-surface px-3.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-os-dim">
          <Dot state="connected" pulse /> live
        </div>
        <div className="os-ticker-track py-[9px] pl-[90px]">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-[26px] pr-[26px]">
              {ticker.map((r) => (
                <span key={copy + r.id} className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[11px]">
                  <b className={r.ok ? 'text-os-ok' : 'text-os-err'}>{r.ok ? 'OK' : 'FAIL'}</b>
                  <span className="text-os-muted">{r.agentId}</span>
                  <span className="text-os-dim">{r.summary}</span>
                  <span className="text-os-border-strong">·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Connections strip */}
      <section className="mb-[22px]">
        <SectionHead label="Connections" count={`${connected}/${connections.length}`} link="Open board" href="/integrations" />
        <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
          {connections.slice(0, 12).map((c) => (
            <Link
              key={c.id}
              href="/integrations"
              className="hoverable flex min-w-0 items-center gap-[9px] rounded-lg-t border border-os-border bg-os-surface px-3 py-[9px]"
            >
              <Dot state={c.state} pulse={c.state === 'connected'} />
              <span className="flex-1 truncate text-[12.5px] font-semibold">{c.name}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 text-os-dim" />
            </Link>
          ))}
        </div>
      </section>

      {/* Social media — combined audience over time (under Connections,
          above the agents / recent-runs row) */}
      <section className="mb-[22px]">
        <SectionHead label="Social media" count="audience over time" link="Open Social" href="/social" />
        <HomeSocialGraph series={[all, ...channels]} posting={posting} />
      </section>

      {/* Main grid */}
      <div className="grid grid-cols-[1.05fr_0.95fr] items-start gap-6 max-[1100px]:grid-cols-1">
        {/* Agents */}
        <section className="min-w-0">
          <SectionHead label="Agents" count={`${activeAgents} live`} link="Full roster" href="/agents" />
          <div className="flex flex-col gap-2">
            {agents.map((a) => {
              const last = lastRunByAgent.get(a.id);
              return (
                <Link
                  key={a.id}
                  href="/agents"
                  className="hoverable flex items-center gap-3 rounded-lg-t border border-os-border bg-os-surface px-3.5 py-[11px]"
                >
                  <Dot state={a.status} pulse={a.status === 'active'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap text-[13.5px] font-semibold">{a.name}</span>
                      {a.tier === 'lead' && <Badge>lead</Badge>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10.5px] text-os-dim">
                      {departments.get(a.departmentId) ?? '—'} ·{' '}
                      {last ? `last run ${last.ok ? 'OK' : 'FAILED'} · ${relativeTime(last.finishedAt)} ago` : 'never run'}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-sm-t border px-2.5 py-[3px] font-mono text-[11px] font-semibold ${
                      a.status === 'active'
                        ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                        : 'border-os-border text-os-dim'
                    }`}
                  >
                    {a.status === 'active' ? 'Run' : 'no creds'}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Activity + focus */}
        <section className="flex min-w-0 flex-col gap-[22px]">
          <div>
            <SectionHead label="Recent runs" count={recentRuns.length} />
            <ul className="flex flex-col gap-1.5">
              {recentRuns.slice(0, 6).map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline gap-2.5 rounded-sm-t border border-os-border bg-os-surface px-3 py-2 font-mono text-[11px]"
                >
                  <span className={`shrink-0 font-bold ${r.ok ? 'text-os-ok' : 'text-os-err'}`}>{r.ok ? 'OK' : 'FAIL'}</span>
                  <span className="shrink-0 text-os-muted">{r.agentId}</span>
                  <span className="min-w-0 flex-1 truncate text-os-dim">{r.summary}</span>
                  <span className="shrink-0 text-os-dim">{relativeTime(r.finishedAt)}</span>
                </li>
              ))}
            </ul>
          </div>

          {nowItems.length > 0 && (
            <div>
              <SectionHead label={`Now · ${nowQuarter?.quarter ?? 'roadmap'}`} link="Roadmap" href="/roadmap" />
              <ul className="flex flex-col gap-1.5">
                {nowItems.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center gap-2.5 rounded-sm-t border border-os-border bg-os-surface px-3 py-[9px]"
                  >
                    <span className="shrink-0 font-mono font-bold text-os-accent">›</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-muted">{it.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-os-dim">
                      {it.departmentId ? departments.get(it.departmentId) ?? '' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* G-Brain card */}
          <Link
            href="/brain"
            className="hoverable flex items-center gap-3.5 rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4"
          >
            <Zap className="h-[18px] w-[18px] shrink-0 text-os-accent" strokeWidth={1.7} />
            <div className="min-w-0 flex-1">
              <Label>G-Brain · knowledge core</Label>
              <div className="mt-2 text-[13px] font-semibold">One memory across every agent</div>
              <div className="mt-1 font-mono text-[10.5px] leading-relaxed text-os-dim">
                {overview.store.totalFiles} pages · health {health ?? '—'}/100 · hybrid search{' '}
                {overview.doctor.connected ? 'verified' : 'degraded'}
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-os-dim" />
          </Link>
        </section>
      </div>
    </div>
  );
}
