'use client';

/**
 * Notion-style agent dock: a slim expand tab on the right edge of every view
 * opens a vertical Conductor panel that knows what screen you're on. The
 * panel fetches /api/conductor/context for the current route, shows what it
 * sees, and sends that context with every message so the agent can talk
 * about "this screen" concretely. Chat itself is the existing conductor
 * pipeline (routes to the best-fit agent, @agent-id to force one).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PanelRightOpen, Send, X } from 'lucide-react';
import { SparkIcon } from '@/components/SparkIcon';

type Turn = { id: string; role: 'user' | 'assistant'; content: string; routedTo?: string };
type ScreenCtx = { title: string; context: string };

export function ConductorPanel() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ScreenCtx | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(async (path: string) => {
    setCtx(null);
    try {
      const res = await fetch(`/api/conductor/context?path=${encodeURIComponent(path)}`);
      if (res.ok) setCtx((await res.json()) as ScreenCtx);
    } catch {
      // panel still works without context — the chat just loses screen grounding
    }
  }, []);

  useEffect(() => {
    if (open) void loadContext(pathname);
  }, [open, pathname, loadContext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setTurns((t) => [...t, { id: `u-${t.length}`, role: 'user', content: text }]);
    setInput('');
    try {
      const res = await fetch('/api/agents/conductor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: ctx ? `Screen: ${ctx.title}\n${ctx.context}` : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `conductor failed (${res.status})`);
      }
      const body = (await res.json()) as { routedTo: string; reply: string };
      setTurns((t) => [...t, { id: `a-${t.length}`, role: 'assistant', content: body.reply, routedTo: body.routedTo }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* right-edge expand tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Conductor"
          title="Conductor — ask about this screen"
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-md-t border border-r-0 border-os-border-strong bg-os-surface px-1.5 py-3 text-os-dim transition-colors hover:border-os-dim hover:text-os-accent"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}

      {/* the dock */}
      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-[360px] max-w-[92vw] flex-col border-l border-os-border-strong bg-os-surface transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ transitionTimingFunction: 'var(--ease)' }}
      >
        <header className="flex items-center gap-2.5 border-b border-os-border px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-os-text bg-os-bg">
            <SparkIcon size={15} shade="var(--text)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold tracking-[0.12em]">CONDUCTOR</div>
            <div className="truncate font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
              seeing: {ctx?.title ?? '…'}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close Conductor"
            className="shrink-0 rounded-sm-t p-1 text-os-dim transition-colors hover:text-os-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {ctx && (
          <p
            className="border-b border-os-border px-4 py-2 font-mono text-[10px] leading-relaxed text-os-dim"
            title={ctx.context}
          >
            {ctx.context.split('\n')[0]}
          </p>
        )}

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {turns.length === 0 && (
            <p className="pt-6 text-center font-mono text-[10.5px] leading-relaxed text-os-dim">
              Ask about this screen — the Conductor sees what you see
              <br />
              and routes to the best-fit agent (@agent-id to force one).
            </p>
          )}
          {turns.map((t) =>
            t.role === 'user' ? (
              <div key={t.id} className="text-right">
                <span className="inline-block max-w-[88%] break-words rounded-md bg-os-surface2 px-2.5 py-1.5 text-left text-[11.5px] text-os-text">
                  {t.content}
                </span>
              </div>
            ) : (
              <div key={t.id} className="text-left">
                {t.routedTo && (
                  <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-os-accent">
                    → {t.routedTo}
                  </div>
                )}
                <span className="inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-md border border-os-border bg-os-bg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-os-muted">
                  {t.content}
                </span>
              </div>
            ),
          )}
          {sending && <p className="font-mono text-[10px] text-os-dim">routing…</p>}
          {error && <p className="font-mono text-[10px] text-os-err">⚠ {error}</p>}
        </div>

        <div className="flex gap-1.5 border-t border-os-border p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={`Ask about ${ctx?.title ?? 'this screen'}…`}
            disabled={sending}
            className="min-w-0 flex-1 rounded-sm-t border border-os-border bg-os-bg px-3 py-1.5 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex shrink-0 items-center rounded-sm-t border border-os-border-strong bg-os-surface2 px-3 py-1.5 text-os-text transition-opacity hover:border-os-dim disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </aside>
    </>
  );
}
