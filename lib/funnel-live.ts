/**
 * Live funnel provider — Alex's real Attio pipeline mapped into the same
 * FunnelJourney shape the seeded funnel uses, so /funnel swaps sources at the
 * repo level exactly as designed. Honest by construction: returns null when
 * the key is missing or Attio is unreachable (the page falls back to seed and
 * says so), Closed Lost is excluded but counted, unknown stages are skipped.
 *
 * ICP fit is a transparent heuristic over the qualification fields Alex
 * actually fills in Attio (budget / pain points / timeline / description /
 * deal value) — it drives node size AND how tightly a lead orbits its hub.
 * Swap it for a real ICP model whenever he defines one.
 */
import { resolveAttioKey } from '@/lib/creds';
import { FUNNEL_STAGES } from '@/lib/funnel';
import {
  FunnelJourneySchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelTouch,
} from '@/lib/schemas';

/** The slice of Attio's /records/query deal shape we read. */
export type AttioDeal = {
  id: { record_id: string };
  created_at: string;
  web_url?: string;
  values: {
    name?: { value?: string }[];
    stage?: { status?: { title?: string }; active_from?: string }[];
    value?: { currency_value?: number }[];
    budget_range?: unknown[];
    pain_points?: unknown[];
    timeline?: unknown[];
    timeline_2?: unknown[];
    project_description?: unknown[];
  };
};

/** Alex's 10 Attio stages → the 5 canonical hubs. Closed Lost leaves the funnel. */
export const ATTIO_STAGE_MAP: Record<string, FunnelStage> = {
  'New Lead': 'first_touch',
  Contacted: 'engaged',
  Nurture: 'nurtured',
  Discovery: 'opted_in',
  'Technical Scoping': 'opted_in',
  'Generating Proposal': 'opted_in',
  'Proposal Sent': 'opted_in',
  Onboarding: 'converted',
  'Closed Won': 'converted',
};

/**
 * Venture heuristic for live deals (they carry no venture attribute yet):
 * company-flavored names read as Vantage client builds, bare person names as
 * Launchpad Cohort mentorship leads. Legible and wrong-at-the-edges by
 * design — add a venture attribute in Attio for the exact split.
 */
const COMPANY_HINTS =
  /\b(llc|inc|ltd|co|corp|company|solutions?|group|agency|tech|labs?|media|studio|consult\w*|clinic|dental|legal|law|realty|roofing|fitness|accounting|capital|ventures?|partners?|systems?|services?)\b|&/i;

export function classifyVenture(dealName: string): 'vantage' | 'launchpad-cohort' {
  return COMPANY_HINTS.test(dealName) ? 'vantage' : 'launchpad-cohort';
}

/**
 * Likelihood-to-buy relative to ICP, 20–100. Deliberately simple and legible:
 * each qualification field Alex filled is evidence of fit.
 */
export function icpScore(deal: AttioDeal): number {
  const has = (arr?: unknown[]) => Array.isArray(arr) && arr.length > 0;
  const v = deal.values;
  let score = 20;
  if (has(v.budget_range)) score += 20;
  if (has(v.pain_points)) score += 20;
  if (has(v.timeline) || has(v.timeline_2)) score += 15;
  if (has(v.project_description)) score += 10;
  if ((v.value?.[0]?.currency_value ?? 0) > 0) score += 15;
  return Math.min(100, score);
}

const day = (iso: string | undefined, fallback: string): string => (iso ?? fallback).slice(0, 10);

/** Pure mapper: raw Attio deals → validated journeys + honest exclusion counts. */
export function mapAttioDeals(
  deals: AttioDeal[],
  now: Date,
): { journeys: FunnelJourney[]; closedLost: number; total: number } {
  let closedLost = 0;
  const journeys: FunnelJourney[] = [];

  for (const deal of deals) {
    const title = deal.values.stage?.[0]?.status?.title ?? '';
    if (title === 'Closed Lost') {
      closedLost++;
      continue;
    }
    const canonical = ATTIO_STAGE_MAP[title];
    if (!canonical) continue; // future/renamed stages must never crash the space

    const id = `attio-${deal.id.record_id}`;
    const name = deal.values.name?.[0]?.value ?? 'Unnamed deal';
    const createdAt = day(deal.created_at, '1970-01-01');
    const stageSince = day(deal.values.stage?.[0]?.active_from, deal.created_at);
    const hubIdx = FUNNEL_STAGES.findIndex((s) => s.id === canonical);
    const score = icpScore(deal);
    const amount = deal.values.value?.[0]?.currency_value ?? 0;
    const converted = canonical === 'converted';

    // Synthesize the transit: one touch per hub travelled, created_at at the
    // start, the real stage-entry date at the end (journeyMeta reads the last
    // touch, so stall = quiet time in the CURRENT Attio stage).
    const touches: FunnelTouch[] = FUNNEL_STAGES.slice(0, hubIdx + 1).map((s, i) => ({
      id: `${id}-t${i + 1}`,
      contactId: id,
      seq: i + 1,
      stage: s.id,
      channel: i === hubIdx && converted ? 'checkout' : 'crm',
      label:
        i === 0
          ? 'Deal created in Attio'
          : i === hubIdx
            ? `Attio stage: ${title}`
            : `Progressed to ${s.label}`,
      source: 'attio' as const,
      at: i === hubIdx ? stageSince : createdAt,
    }));

    try {
      journeys.push(
        FunnelJourneySchema.parse({
          id,
          name,
          venture: classifyVenture(name),
          status: canonical,
          product: converted ? title : null,
          amountUsd: amount > 0 ? amount : converted ? 0 : null,
          relationship: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
          likelihood: score,
          url: deal.web_url ?? null,
          createdAt,
          touches,
        }),
      );
    } catch {
      // a malformed row is skipped, never fatal
    }
  }

  // Freshest movement first — same ordering feel as the seeded funnel.
  journeys.sort((a, b) => (b.touches.at(-1)?.at ?? '').localeCompare(a.touches.at(-1)?.at ?? ''));
  void now;
  return { journeys, closedLost, total: deals.length };
}

/**
 * Fetch the live pipeline. Null = not available (no key / API error) — the
 * caller falls back to the seeded funnel and labels the page accordingly.
 */
export async function attioFunnelJourneys(
  now = new Date(),
): Promise<{ journeys: FunnelJourney[]; closedLost: number; total: number } | null> {
  // FUNNEL_PROVIDER=seed pins the seeded funnel (tests, offline demos).
  if ((process.env.FUNNEL_PROVIDER ?? 'attio') !== 'attio') return null;
  const key = resolveAttioKey();
  if (!key) return null;
  try {
    const deals: AttioDeal[] = [];
    for (let offset = 0; offset < 2000; offset += 500) {
      const res = await fetch('https://api.attio.com/v2/objects/deals/records/query', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500, offset }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: AttioDeal[] };
      const page = body.data ?? [];
      deals.push(...page);
      if (page.length < 500) break;
    }
    return mapAttioDeals(deals, now);
  } catch {
    return null;
  }
}
