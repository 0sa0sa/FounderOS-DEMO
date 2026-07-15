import { getDb } from '@/lib/data';
import { allConnectorStatuses } from '@/lib/connectors';
import { PageHeader } from '@/components/PageHeader';
import { ApiKeys } from '@/components/ApiKeys';
import { Badge, Dot, SectionHead, type BadgeTone } from '@/components/terminal';
import type { ConnectorState } from '@/lib/connectors/types';
import type { Tool } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const STATE_BADGE: Record<ConnectorState, { tone: BadgeTone; ghost: boolean; label: string }> = {
  connected: { tone: 'ok', ghost: false, label: 'Connected' },
  not_configured: { tone: 'default', ghost: true, label: 'Not configured' },
  error: { tone: 'err', ghost: false, label: 'Error' },
};

const TOOL_STATE: Record<Tool['status'], string> = {
  connected: 'Connected',
  available: 'Ready for creds',
  planned: 'Planned',
};

export default async function ConnectionsPage() {
  const db = getDb();
  const [connections, tools] = await Promise.all([
    allConnectorStatuses(),
    Promise.resolve(db.tools.all()),
  ]);

  const categories = new Map<string, Tool[]>();
  for (const tool of tools) {
    const bucket = categories.get(tool.category) ?? [];
    bucket.push(tool);
    categories.set(tool.category, bucket);
  }
  const connected = connections.filter((c) => c.state === 'connected').length;

  return (
    <div>
      <PageHeader
        eyebrow="live status"
        title="Connections"
      />

      {/* Live connector status — real checks, not seeded */}
      <section className="mb-8">
        <SectionHead label="Connector groups" count={`${connected}/${connections.length}`} />
        <div className="flex flex-col gap-2">
          {connections.map((conn) => {
            const badge = STATE_BADGE[conn.state];
            return (
              <div
                key={conn.id}
                className="hoverable flex items-center gap-3.5 rounded-lg-t border border-os-border bg-os-surface px-4 py-3.5"
              >
                <Dot state={conn.state} pulse={conn.state === 'connected'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 text-[13.5px] font-semibold">
                    {conn.name}
                    <Badge tone={badge.tone} ghost={badge.ghost}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10.5px] leading-normal text-os-dim">{conn.detail}</p>
                </div>
                <span className="hidden shrink-0 font-mono text-[10px] text-os-dim lg:block">{conn.kind}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="space-y-7">
        {[...categories.entries()].map(([category, categoryTools]) => (
          <section key={category}>
            <SectionHead label={category} count={categoryTools.length} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ultra:grid-cols-4">
              {categoryTools.map((tool) => (
                <div key={tool.id} className="hoverable rounded-lg-t border border-os-border bg-os-surface px-[15px] py-3">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <Dot state={tool.status} />
                    <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                    <Badge ghost={tool.status === 'planned'} tone={tool.status === 'connected' ? 'ok' : 'default'}>
                      {TOOL_STATE[tool.status]}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-os-dim [text-wrap:pretty]">{tool.description}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <ApiKeys />
    </div>
  );
}
