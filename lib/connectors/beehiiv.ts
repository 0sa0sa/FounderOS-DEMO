import type { ConnectorStatus } from '@/lib/connectors/types';

// Beehiiv newsletter audience. Real-ready: honest `not_configured` until a key
// lands, live subscriber count once it does. Same cache+timeout discipline as
// the Zernio connector.

const BEEHIIV_API = 'https://api.beehiiv.com/v2';
const TTL_MS = 60_000;

/** Map a Beehiiv `publications/{id}?expand[]=stats` payload to a subscriber
    count. Prefers active subscriptions; null when no usable number is present. */
export function parseBeehiivStats(raw: unknown): { subscribers: number } | null {
  const r = (raw ?? {}) as Record<string, any>;
  const stats = r?.data?.stats ?? r?.stats;
  const n = stats?.active_subscriptions ?? stats?.total_subscriptions;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return { subscribers: n };
  return null;
}

function endpoint(pub: string): string {
  return `${BEEHIIV_API}/publications/${pub}?expand[]=stats`;
}

let cache: { at: number; data: number | null } | null = null;

/** Live subscriber count, 60s-cached; null when unconfigured or on error so
    callers fall back to seeded history (never a fake number). */
export async function beehiivSubscribers(
  env: Record<string, string | undefined> = process.env,
): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  const key = env.BEEHIIV_API_KEY;
  const pub = env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) return null;
  try {
    const res = await fetch(endpoint(pub), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseBeehiivStats(await res.json());
    cache = { at: now, data: parsed?.subscribers ?? null };
    return cache.data;
  } catch {
    return cache?.data ?? null;
  }
}

export async function beehiivStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  const key = env.BEEHIIV_API_KEY;
  const pub = env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) {
    return {
      id: 'beehiiv',
      name: 'Beehiiv (Email List)',
      kind: 'social',
      state: 'not_configured',
      detail: 'Set BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID in .env.local.',
    };
  }
  try {
    const res = await fetch(endpoint(pub), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseBeehiivStats(await res.json());
    if (!parsed) throw new Error('no subscriber stats in response');
    return {
      id: 'beehiiv',
      name: 'Beehiiv (Email List)',
      kind: 'social',
      state: 'connected',
      detail: `${parsed.subscribers.toLocaleString('en-US')} subscribers`,
      meta: { subscribers: parsed.subscribers },
    };
  } catch (err) {
    return {
      id: 'beehiiv',
      name: 'Beehiiv (Email List)',
      kind: 'social',
      state: 'error',
      detail: `Key set but API check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
