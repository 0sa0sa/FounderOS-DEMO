'use client';

/**
 * The chat-enabled comms feed. Every item expands into a reply box:
 * Slack replies send for real through the bot token; email replies open a
 * prefilled draft in Mail (no SMTP relay wired); WhatsApp replies copy the
 * text and open the app (the local chat store is read-only). Priority
 * 1/2/3 (red/yellow/green) comes from tagged contacts and can be set
 * inline on any sender.
 */
import { useMemo, useState } from 'react';
import { MessageSquare, Mail, Hash, Send, Copy, ExternalLink } from 'lucide-react';
import { CONTACT_TIERS } from '@/lib/life-map';
import type { CommsItem, CommsSource } from '@/lib/comms';
import type { ContactTag } from '@/lib/schemas';

const SOURCE_ICON: Record<CommsSource, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  slack: Hash,
};

const TIER_COLOR: Record<number, string> = Object.fromEntries(
  CONTACT_TIERS.map((t) => [t.tier, t.color]),
);

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function CommsFeed({ initialFeed, initialTags }: { initialFeed: CommsItem[]; initialTags: ContactTag[] }) {
  const [tags, setTags] = useState(initialTags);
  const [filter, setFilter] = useState<0 | 1 | 2 | 3>(0); // 0 = all
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  // Re-annotate locally so newly tagged people color up without a reload.
  const feed = useMemo(() => {
    return initialFeed.map((item) => {
      const hay = (item.sender ?? item.title).toLowerCase().trim();
      let best: number | undefined;
      for (const tag of tags) {
        const person = tag.person.toLowerCase().trim();
        if (person === hay || (person.length >= 5 && hay.includes(person))) {
          if (best === undefined || tag.tier < best) best = tag.tier;
        }
      }
      return { ...item, priority: best as CommsItem['priority'] };
    });
  }, [initialFeed, tags]);

  const visible = filter === 0 ? feed : feed.filter((i) => i.priority === filter);
  const counts = [1, 2, 3].map((t) => feed.filter((i) => i.priority === t).length);

  const setPriority = async (item: CommsItem, tier: number) => {
    const person = item.sender ?? item.title;
    const existing = tags.find((t) => t.person === person && t.channel === item.source);
    if (existing?.tier === tier) {
      // toggle off
      await fetch('/api/contacts/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person, channel: item.source }),
      });
      setTags((prev) => prev.filter((t) => !(t.person === person && t.channel === item.source)));
      return;
    }
    const tag: ContactTag = { person, channel: item.source, tag: 'manual', tier: tier as 1 | 2 | 3 };
    const res = await fetch('/api/contacts/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tag),
    });
    if (res.ok) {
      setTags((prev) => [...prev.filter((t) => !(t.person === person && t.channel === item.source)), tag]);
    }
  };

  const reply = async (item: CommsItem) => {
    const text = draft.trim();
    if (!text) return;
    setStatus(null);

    if (item.source === 'slack' && item.replyTo) {
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'slack', channel: item.replyTo, text }),
      });
      const body = await res.json().catch(() => ({}));
      setStatus(body.detail ?? (res.ok ? 'sent' : 'failed'));
      if (res.ok) setDraft('');
      return;
    }

    if (item.source === 'email') {
      if (!item.replyTo) {
        setStatus('no reply address on this message');
        return;
      }
      // Try a real SMTP send; fall back to a mailto: draft if unconfigured/failed.
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'email', account: item.account, to: item.replyTo, subject: `Re: ${item.preview}`, text }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && body.ok) {
        setStatus('sent');
        setDraft('');
        return;
      }
      const subject = encodeURIComponent(`Re: ${item.preview}`);
      window.location.href = `mailto:${item.replyTo}?subject=${subject}&body=${encodeURIComponent(text)}`;
      setStatus(body.error ? `SMTP unavailable — opened draft` : 'opened draft in Mail');
      return;
    }

    // whatsapp: local store is read-only — copy and hand off to the app
    await navigator.clipboard.writeText(text);
    window.location.href = 'whatsapp://';
    setStatus(`copied — paste into "${item.sender}" in WhatsApp`);
  };

  const tagged = [...tags].sort((a, b) => a.tier - b.tier || a.person.localeCompare(b.person));

  return (
    <div>
      {/* priority filter + legend */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter(0)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            filter === 0 ? 'border-os-text bg-os-text text-os-bg' : 'border-os-border bg-os-surface text-os-muted hover:text-os-text'
          }`}
        >
          All
        </button>
        {CONTACT_TIERS.map((t, i) => (
          <button
            key={t.tier}
            onClick={() => setFilter(filter === t.tier ? 0 : (t.tier as 1 | 2 | 3))}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === t.tier ? 'text-black' : 'border-os-border bg-os-surface text-os-muted hover:text-os-text'
            }`}
            style={filter === t.tier ? { background: t.color, borderColor: t.color } : undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: filter === t.tier ? '#000' : t.color }} />
            {t.tier} · {t.respond} ({counts[i]})
          </button>
        ))}
        <span className="ml-auto text-[10px] text-os-dim">click a message to reply · 1/2/3 to set priority</span>
      </div>

      {/* feed */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-os-border px-4 py-10 text-center text-xs text-os-dim">
          {filter === 0 ? 'No messages readable yet — connect a source above.' : 'Nothing at this priority. Tag senders with 1/2/3 inside any message.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((item, i) => {
            const Icon = SOURCE_ICON[item.source];
            const open = openIdx === i;
            const accent = item.priority ? TIER_COLOR[item.priority] : undefined;
            return (
              <li
                key={`${item.source}-${item.title}-${item.ts}-${i}`}
                className="hoverable rounded-xl border border-os-border bg-os-surface"
                style={accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
              >
                <button
                  onClick={() => {
                    setOpenIdx(open ? null : i);
                    setDraft('');
                    setStatus(null);
                  }}
                  className="flex w-full items-center gap-3.5 px-4 py-3 text-left"
                >
                  <Icon className="h-4 w-4 shrink-0 text-os-dim" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {item.priority && (
                        <span
                          className="shrink-0 rounded px-1 font-mono text-[9px] font-bold text-black"
                          style={{ background: accent }}
                        >
                          {item.priority}
                        </span>
                      )}
                      <span className="truncate text-sm font-semibold">{item.title}</span>
                      {(item.unread ?? 0) > 0 && (
                        <span className="shrink-0 rounded-full bg-os-text px-1.5 text-[10px] font-bold text-os-bg">
                          {item.unread}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-os-dim">{item.preview || '—'}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-os-dim">{relativeTime(item.ts)}</span>
                </button>

                {open && (
                  <div className="border-t border-os-border px-4 py-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-widest text-os-dim">
                        priority for {item.sender ?? item.title}
                      </span>
                      {CONTACT_TIERS.map((t) => {
                        const active = item.priority === t.tier;
                        return (
                          <button
                            key={t.tier}
                            onClick={() => setPriority(item, t.tier)}
                            title={`${t.label} — ${t.tags.join(', ')}`}
                            className={`h-6 w-6 rounded font-mono text-[11px] font-bold transition-transform hover:scale-110 ${
                              active ? 'text-black' : 'text-os-muted'
                            }`}
                            style={{
                              background: active ? t.color : 'transparent',
                              border: `1px solid ${t.color}`,
                            }}
                          >
                            {t.tier}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) reply(item);
                        }}
                        rows={2}
                        placeholder={
                          item.source === 'slack'
                            ? `Reply in #${item.replyTo} — sends via bot`
                            : item.source === 'email'
                              ? `Reply to ${item.replyTo ?? item.sender} — opens in Mail`
                              : `Reply to ${item.sender} — copies & opens WhatsApp`
                        }
                        className="min-w-0 flex-1 resize-y rounded-lg border border-os-border bg-os-bg px-3 py-2 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
                      />
                      <button
                        onClick={() => reply(item)}
                        disabled={!draft.trim()}
                        className="flex shrink-0 items-center gap-1.5 self-end rounded-lg bg-os-text px-3 py-2 text-xs font-bold text-os-bg disabled:opacity-30"
                      >
                        {item.source === 'slack' ? <Send className="h-3 w-3" /> : item.source === 'email' ? <ExternalLink className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {item.source === 'slack' ? 'Send' : item.source === 'email' ? 'Open in Mail' : 'Copy & open'}
                      </button>
                    </div>
                    {status && <p className="mt-1.5 font-mono text-[10px] text-os-muted">{status}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* the light contact-priority manager */}
      <h2 className="mb-2 mt-10 text-sm font-bold uppercase tracking-widest text-os-muted">Priority contacts</h2>
      {tagged.length === 0 ? (
        <p className="text-xs text-os-dim">
          Nobody tagged yet — open any message above and hit 1, 2, or 3 on the sender.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {CONTACT_TIERS.map((t) => (
            <div key={t.tier} className="hoverable rounded-xl border border-os-border bg-os-surface p-3" style={{ boxShadow: `inset 3px 0 0 ${t.color}` }}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="font-mono text-sm font-bold" style={{ color: t.color }}>{t.tier}</span>
                <span className="text-[11px] text-os-muted">{t.label} · respond {t.respond}</span>
              </div>
              {tagged.filter((x) => x.tier === t.tier).map((x) => (
                <div key={`${x.person}-${x.channel}`} className="flex items-center gap-2 py-0.5 text-[11px] text-os-muted">
                  <span className="truncate">{x.person}</span>
                  <span className="shrink-0 font-mono text-[9px] text-os-dim">{x.channel}</span>
                  <button
                    onClick={async () => {
                      await fetch('/api/contacts/tags', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ person: x.person, channel: x.channel }),
                      });
                      setTags((prev) => prev.filter((p) => !(p.person === x.person && p.channel === x.channel)));
                    }}
                    className="ml-auto shrink-0 text-os-dim hover:text-os-text"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {tagged.filter((x) => x.tier === t.tier).length === 0 && (
                <div className="text-[10px] text-os-dim">empty</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
