'use client';

/**
 * The pinned journey card — one card, both canvases (flow + radial) so a
 * clicked lead reads identically wherever Alex is looking: temperature,
 * quiet clock, outreach channels, and the raw touch trail.
 */
import { CHANNEL_GLYPHS, FUNNEL_STAGES, STALL_DAYS, type FunnelSpaceNode } from '@/lib/funnel';
import { usd } from '@/lib/funnel-viz';

const RELATIONSHIP_COLOR = {
  hot: 'var(--funnel-hot)',
  warm: 'var(--funnel-warm)',
  cold: 'var(--funnel-cold)',
} as const;

export function FunnelNodeCard({ node, onClose }: { node: FunnelSpaceNode; onClose: () => void }) {
  return (
    // top-11 keeps the canvas's fullscreen button (top-1) clickable above it
    <div className="absolute right-3 top-11 z-10 w-[300px] rounded-md-t border border-os-border-strong bg-os-surface2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold">{node.name}</div>
          <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
            {node.venture === 'vantage' ? 'Vantage' : 'Launchpad Cohort'} ·{' '}
            {FUNNEL_STAGES.find((s) => s.id === node.status)?.label}
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 font-mono text-[11px] text-os-dim hover:text-os-text" aria-label="Close">
          ×
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div>
          <div className="text-os-dim">likelihood</div>
          <div className="text-[12px] text-os-text">{node.likelihood}%</div>
        </div>
        <div>
          <div className="text-os-dim">relationship</div>
          <div className="text-[12px] capitalize" style={{ color: RELATIONSHIP_COLOR[node.relationship] }}>{node.relationship}</div>
        </div>
        <div>
          <div className="text-os-dim">quiet for</div>
          <div className={`text-[12px] ${node.state === 'stalled' ? 'text-os-err' : 'text-os-text'}`}>{node.daysSinceLastTouch}d</div>
        </div>
      </div>
      {node.state === 'converted' && node.product && (
        <div className="mt-2 rounded-sm-t border border-[color-mix(in_oklab,var(--ok)_35%,transparent)] bg-[color-mix(in_oklab,var(--ok)_9%,transparent)] px-2 py-1 font-mono text-[10px] text-os-ok">
          {node.product} · {usd(node.amountUsd ?? 0)}
        </div>
      )}
      {node.state === 'stalled' && (
        <div className="mt-2 rounded-sm-t border border-[color-mix(in_oklab,var(--err)_35%,transparent)] bg-[color-mix(in_oklab,var(--err)_9%,transparent)] px-2 py-1 font-mono text-[10px] text-os-err">
          stalled — quiet past {STALL_DAYS}d before converting
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wide">
        {node.email && (
          <a href={`mailto:${node.email}`} title={node.email} className="text-os-accent hover:underline">
            email
          </a>
        )}
        {node.phone && (
          <a
            href={`https://wa.me/${node.phone.replace(/[^\d]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            title={node.phone}
            className="text-os-accent hover:underline"
          >
            whatsapp
          </a>
        )}
        {node.phone && (
          <a href={`sms:${node.phone}`} className="text-os-accent hover:underline">
            sms
          </a>
        )}
        {node.url && (
          <a href={node.url} target="_blank" rel="noopener noreferrer" className="text-os-accent hover:underline">
            {node.url.includes('gohighlevel') ? 'open in GHL ↗' : 'open in Attio ↗'}
          </a>
        )}
      </div>
      <ol className="mt-2 flex flex-col gap-1">
        {node.touches.map((t) => (
          <li key={t.id} className="flex items-baseline gap-1.5 text-[11px] text-os-muted">
            <span className="shrink-0 font-mono text-[10px] text-os-accent">{CHANNEL_GLYPHS[t.channel] ?? '·'}</span>
            <span className="min-w-0 flex-1 truncate" title={t.label}>{t.label}</span>
            <span className="shrink-0 font-mono text-[9px] text-os-dim">{t.at.slice(5)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
