import { describe, expect, test } from 'vitest';
import { funnelNeuralModel, NEURAL_LABEL_CAP } from '@/lib/funnel-neural';
import type { FunnelContact, FunnelJourney, FunnelTouch } from '@/lib/schemas';

const NOW = new Date('2026-07-08T12:00:00Z');

const touch = (over: Partial<FunnelTouch> = {}): FunnelTouch => ({
  id: 'ft-test',
  contactId: 'fc-test',
  seq: 1,
  stage: 'first_touch',
  channel: 'organic',
  label: 'IG reel: agency systems',
  source: 'trakyo',
  at: '2026-07-01',
  ...over,
});

const journey = (over: Partial<FunnelContact> = {}, touches: FunnelTouch[] = [touch()]): FunnelJourney => ({
  id: 'fc-test',
  name: 'Test Client',
  venture: 'vantage',
  status: 'engaged',
  product: null,
  amountUsd: null,
  relationship: 'warm',
  likelihood: 50,
  url: null,
  email: null,
  phone: null,
  createdAt: '2026-07-01',
  touches,
  ...over,
});

/** id, status, likelihood, touch days-ago list (newest last). */
function lead(id: string, status: FunnelJourney['status'], likelihood: number, daysAgo: number[]): FunnelJourney {
  const stages: FunnelJourney['status'][] = ['first_touch', 'engaged', 'nurtured', 'opted_in', 'converted'];
  const depth = stages.indexOf(status);
  return journey(
    { id, name: `Lead ${id}`, status, likelihood },
    daysAgo.map((d, i) =>
      touch({
        id: `${id}-t${i}`,
        contactId: id,
        seq: i + 1,
        stage: stages[Math.min(i, depth)],
        at: new Date(NOW.getTime() - d * 86_400_000).toISOString().slice(0, 10),
      }),
    ),
  );
}

describe('funnelNeuralModel — the funnel as a feedforward net', () => {
  test('layers carry real reached-counts, INPUT first, OUTPUT last', () => {
    const model = funnelNeuralModel(
      [
        lead('a', 'first_touch', 40, [1]),
        lead('b', 'engaged', 60, [5, 4]),
        lead('c', 'converted', 100, [20, 15, 10, 5, 2]),
      ],
      NOW,
    );
    expect(model.layers).toHaveLength(5);
    expect(model.layers[0].name).toBe('INPUT');
    expect(model.layers[4].name).toBe('OUTPUT');
    expect(model.layers.map((l) => l.count)).toEqual([3, 2, 1, 1, 1]); // reached is cumulative
  });

  test('a lead gets one node per layer reached and one edge per transition', () => {
    const model = funnelNeuralModel([lead('c', 'converted', 100, [20, 15, 10, 5, 2])], NOW);
    const nodes = model.nodes.filter((n) => n.leadId === 'c');
    expect(nodes.map((n) => n.layer)).toEqual([0, 1, 2, 3, 4]);
    const edges = model.edges.filter((e) => e.leadId === 'c');
    expect(edges.map((e) => [e.fromLayer, e.toLayer])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  test('edge hue: red = stalled/decayed, green = won or hot momentum, yellow = uncommitted middle', () => {
    const hot = lead('hot', 'engaged', 90, [2, 1]);
    hot.relationship = 'hot';
    const warm = lead('warm', 'engaged', 55, [3, 2]);
    warm.relationship = 'warm';
    const cold = lead('cold', 'engaged', 20, [4, 3]);
    cold.relationship = 'cold';
    const model = funnelNeuralModel(
      [lead('won', 'converted', 100, [20, 15, 10, 5, 2]), hot, warm, cold, lead('stuck', 'engaged', 30, [40, 30])],
      NOW,
    );
    const hueOf = (id: string) => model.edges.find((e) => e.leadId === id)?.hue;
    expect(hueOf('won')).toBe('green');
    expect(hueOf('hot')).toBe('green');
    expect(hueOf('warm')).toBe('yellow');
    expect(hueOf('cold')).toBe('yellow');
    expect(hueOf('stuck')).toBe('red');
  });

  test('edge sign: healthy/converted strands are positive, stalled leads run negative', () => {
    const model = funnelNeuralModel(
      [
        lead('won', 'converted', 100, [20, 15, 10, 5, 2]),
        lead('fresh', 'engaged', 70, [2, 1]),
        lead('stuck', 'engaged', 30, [40, 30]), // 30 quiet days = stalled + decaying
      ],
      NOW,
    );
    expect(model.edges.filter((e) => e.leadId === 'won').every((e) => e.sign === 1)).toBe(true);
    expect(model.edges.filter((e) => e.leadId === 'fresh').every((e) => e.sign === 1)).toBe(true);
    expect(model.edges.filter((e) => e.leadId === 'stuck').every((e) => e.sign === -1)).toBe(true);
    const stuck = model.edges.find((e) => e.leadId === 'stuck');
    expect(stuck?.decay).toBeGreaterThan(0);
    expect(stuck?.strength).toBeCloseTo(0.3, 5);
  });

  test('labels cap at the top likelihood rows and carry a touch sparkline', () => {
    const many = Array.from({ length: 60 }, (_, i) => lead(`l${i}`, 'engaged', i, [3, 1]));
    const model = funnelNeuralModel(many, NOW);
    expect(model.labeled).toHaveLength(NEURAL_LABEL_CAP);
    // highest likelihood wins a label
    expect(model.labeled.some((l) => l.leadId === 'l59')).toBe(true);
    expect(model.labeled.some((l) => l.leadId === 'l0')).toBe(false);
    for (const l of model.labeled) {
      expect(l.spark.length).toBeGreaterThan(0);
      expect(l.spark.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });

  test('empty input yields empty but well-formed layers', () => {
    const model = funnelNeuralModel([], NOW);
    expect(model.layers).toHaveLength(5);
    expect(model.layers.every((l) => l.count === 0)).toBe(true);
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
    expect(model.labeled).toEqual([]);
  });
});
