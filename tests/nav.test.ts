import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NAV_OPERATE, NAV_SYSTEM, NAV_LIBRARY, NAV_ORDER, DIGIT_VIEWS } from '@/lib/nav';

describe('shared nav config', () => {
  test('NAV_ORDER is the visible top-to-bottom order: Operate → System → Variants', () => {
    expect(NAV_ORDER).toEqual([...NAV_OPERATE, ...NAV_SYSTEM, ...NAV_LIBRARY].map((n) => n.href));
  });

  test('digit shortcuts (1–9) map to the first 9 views in visible order', () => {
    expect(DIGIT_VIEWS).toEqual(NAV_ORDER.slice(0, 9));
    expect(DIGIT_VIEWS).toHaveLength(9);
  });

  test('every digit target is a real page route', () => {
    for (const href of DIGIT_VIEWS) {
      const rel = href === '/' ? 'app/page.tsx' : `app/${href.replace(/^\//, '')}/page.tsx`;
      expect(existsSync(path.join(process.cwd(), rel)), `${href} should have a page.tsx`).toBe(true);
    }
  });

  test('regression: the stale mapping is fixed — Social, Content, Finances are digit-reachable', () => {
    for (const href of ['/social', '/content', '/finances']) {
      expect(DIGIT_VIEWS, `${href} must be reachable by digit`).toContain(href);
    }
  });

  test('Funnel sits between Comms and Social (Alex, 2026-07-02)', () => {
    const hrefs = NAV_OPERATE.map((n) => n.href);
    expect(hrefs.indexOf('/funnel')).toBe(hrefs.indexOf('/comms') + 1);
    expect(hrefs.indexOf('/social')).toBe(hrefs.indexOf('/funnel') + 1);
  });

  test('CommandPalette consumes the shared DIGIT_VIEWS (no private stale copy)', () => {
    const src = readFileSync(path.join(process.cwd(), 'components', 'CommandPalette.tsx'), 'utf8');
    expect(src).toMatch(/from '@\/lib\/nav'/);
    expect(src).not.toMatch(/const DIGIT_VIEWS\s*=/); // must import, not redefine
  });
});
