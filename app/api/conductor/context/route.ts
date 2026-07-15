import { NextResponse } from 'next/server';
import { screenContextFor } from '@/lib/screen-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // better-sqlite3 is native — keep off the edge runtime

/** What the Conductor panel tells the agent about the screen it's docked on. */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path') ?? '/';
  const resolved = await screenContextFor(path);
  return NextResponse.json(resolved);
}
