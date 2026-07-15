/**
 * Neural-net math for the flow view — the funnel as a feedforward network.
 * Layers are the real stages (widths = leads that actually reached them),
 * every lead is a neuron per layer reached, and each stage transition is a
 * weighted strand: positive (green) while the relationship is healthy or won,
 * negative (red) once the lead sits stalled or decaying. Strength = the
 * lead's likelihood-to-buy, so the web is brightest where the pipeline is
 * hottest. Pure and deterministic — the canvas just draws this.
 */
import { FUNNEL_STAGES, funnelSpaceModel, type FunnelSpaceNode } from '@/lib/funnel';
import type { FunnelJourney } from '@/lib/schemas';

/** Input rows that get a name label + sparkline before the list is elided. */
export const NEURAL_LABEL_CAP = 40;

export type NeuralLayer = {
  /** INPUT · HL 1..n · OUTPUT — terminal flavor over the real stage names. */
  name: string;
  stageLabel: string;
  count: number;
};

export type NeuralNode = { leadId: string; layer: number; row: number };

export type NeuralHue = 'green' | 'yellow' | 'red';

export type NeuralEdge = {
  leadId: string;
  fromLayer: number;
  toLayer: number;
  fromRow: number;
  toRow: number;
  /** +1 healthy/converted (green strand) · −1 stalled or decaying (red). */
  sign: 1 | -1;
  /** Plasma hue: red = stalled/decayed, green = won or hot momentum,
   * yellow = active but uncommitted (warm/cold relationship). */
  hue: NeuralHue;
  /** Weight magnitude 0–1 — the lead's likelihood-to-buy. */
  strength: number;
  decay: number;
};

export type NeuralLabel = { leadId: string; name: string; row: number; spark: number[] };

export type FunnelNeuralModel = {
  layers: NeuralLayer[];
  nodes: NeuralNode[];
  edges: NeuralEdge[];
  labeled: NeuralLabel[];
  /** Full space nodes by lead — the card and hover copy read from these. */
  leads: FunnelSpaceNode[];
};

const layerName = (i: number, last: number): string => (i === 0 ? 'INPUT' : i === last ? 'OUTPUT' : `HL ${i}`);

/** Touch cadence 0–1 per touch — recent contact runs high, old runs low. */
function sparkFor(j: FunnelJourney, now: Date): number[] {
  const points = j.touches.slice(-8).map((t) => {
    const days = Math.max(0, (now.getTime() - new Date(`${t.at}T00:00:00Z`).getTime()) / 86_400_000);
    return Math.max(0, Math.min(1, 1 - days / 60));
  });
  return points.length > 0 ? points : [0];
}

export function funnelNeuralModel(journeys: FunnelJourney[], now: Date): FunnelNeuralModel {
  const last = FUNNEL_STAGES.length - 1;
  const leads = funnelSpaceModel(journeys, now);
  const depthOf = (n: FunnelSpaceNode) => FUNNEL_STAGES.findIndex((s) => s.id === n.status);

  const layers: NeuralLayer[] = FUNNEL_STAGES.map((s, i) => ({
    name: layerName(i, last),
    stageLabel: s.label,
    count: 0,
  }));

  const nodes: NeuralNode[] = [];
  const edges: NeuralEdge[] = [];
  const rowOf = new Map<string, number[]>(); // leadId → row per layer

  for (const lead of leads) {
    const depth = depthOf(lead);
    const rows: number[] = [];
    for (let layer = 0; layer <= depth; layer++) {
      rows[layer] = layers[layer].count++;
      nodes.push({ leadId: lead.id, layer, row: rows[layer] });
    }
    rowOf.set(lead.id, rows);
    const sign: 1 | -1 = lead.state === 'stalled' || lead.state === 'decayed' ? -1 : 1;
    const hue: NeuralHue =
      sign === -1 ? 'red' : lead.state === 'converted' || lead.relationship === 'hot' ? 'green' : 'yellow';
    for (let layer = 0; layer < depth; layer++) {
      edges.push({
        leadId: lead.id,
        fromLayer: layer,
        toLayer: layer + 1,
        fromRow: rows[layer],
        toRow: rows[layer + 1],
        sign,
        hue,
        strength: lead.likelihood / 100,
        decay: lead.decay,
      });
    }
  }

  const byId = new Map(journeys.map((j) => [j.id, j]));
  const labeled: NeuralLabel[] = [...leads]
    .sort((a, b) => b.likelihood - a.likelihood)
    .slice(0, NEURAL_LABEL_CAP)
    .map((lead) => ({
      leadId: lead.id,
      name: lead.name,
      row: rowOf.get(lead.id)?.[0] ?? 0,
      spark: sparkFor(byId.get(lead.id)!, now),
    }));

  return { layers, nodes, edges, labeled, leads };
}
