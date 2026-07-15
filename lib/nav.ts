/**
 * Single source of truth for the app's primary navigation. The Sidebar renders
 * these groups in order; the CommandPalette derives its digit (1–9) shortcuts
 * from the same visible order, so the two can never drift apart again.
 */
import {
  Home,
  MessageSquare,
  Share2,
  Clapperboard,
  Users,
  Network,
  Brain,
  Wallet,
  Filter,
  Map,
  Plug,
  BarChart3,
  LayoutGrid,
  Layers,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: typeof Home };

export const NAV_OPERATE: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/comms', label: 'Comms', icon: MessageSquare },
  { href: '/funnel', label: 'Funnel', icon: Filter },
  { href: '/social', label: 'Social', icon: Share2 },
  { href: '/content', label: 'Content', icon: Clapperboard },
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/org', label: 'Org Chart', icon: Network },
  { href: '/brain', label: 'G-Brain', icon: Brain },
  { href: '/finances', label: 'Finances', icon: Wallet },
];

export const NAV_SYSTEM: NavItem[] = [
  { href: '/integrations', label: 'Connections', icon: Plug },
  { href: '/roadmap', label: 'Roadmap', icon: Map },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reference', label: 'Reference Model', icon: LayoutGrid },
];

// At the very bottom: persona templates that can run variants of this platform.
export const NAV_LIBRARY: NavItem[] = [{ href: '/personas', label: 'Personas', icon: Layers }];

/** Visible top-to-bottom order across all groups. */
export const NAV_ORDER: string[] = [...NAV_OPERATE, ...NAV_SYSTEM, ...NAV_LIBRARY].map((n) => n.href);

/** Digit keys 1–9 jump to the first nine views in visible order. */
export const DIGIT_VIEWS: string[] = NAV_ORDER.slice(0, 9);
