import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { CommsItem } from '@/lib/comms';

// WhatsApp ships two separate macOS apps, each with its own group container:
// the consumer app and WhatsApp Business (SMB). Alex switched to Business,
// so we look in both and read whichever database is actually live.
const WHATSAPP_CONTAINERS = [
  'group.net.whatsapp.WhatsApp.shared', // consumer
  'group.net.whatsapp.WhatsAppSMB.shared', // Business
];

/** Candidate ChatStorage.sqlite paths, one per known WhatsApp container. */
export function whatsappContainerPaths(): string[] {
  return WHATSAPP_CONTAINERS.map((container) =>
    path.join(os.homedir(), 'Library', 'Group Containers', container, 'ChatStorage.sqlite'),
  );
}

/**
 * Pick the WhatsApp database to read: of the candidate paths that exist, the
 * most recently modified one — i.e. the app you're actually using (consumer or
 * Business). Null when none are present. Injectable for tests.
 */
export function resolveChatDb(paths: string[] = whatsappContainerPaths()): string | null {
  const existing = paths.filter((p) => fs.existsSync(p));
  if (existing.length === 0) return null;
  return existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const CORE_DATA_EPOCH_MS = Date.parse('2001-01-01T00:00:00.000Z');

/**
 * WhatsApp's ZLASTMESSAGEDATE unit differs across app builds (seconds,
 * sub-second ticks…). Rather than hardcode a unit, calibrate: the largest
 * raw value in an actively-used database is "approximately now", so
 * scale = maxRaw / secondsSince2001(now), and every row maps through it.
 */
export function calibratedDate(raw: number, maxRaw: number, nowMs = Date.now()): Date {
  const elapsedSeconds = (nowMs - CORE_DATA_EPOCH_MS) / 1000;
  const scale = maxRaw > 0 ? maxRaw / elapsedSeconds : 1;
  const seconds = raw > 0 ? raw / scale : 0;
  return new Date(CORE_DATA_EPOCH_MS + seconds * 1000);
}

type ChatRow = {
  ZPARTNERNAME: string | null;
  ZLASTMESSAGEDATE: number | null;
  ZUNREADCOUNT: number | null;
  lastText: string | null;
  lastDate: number | null;
};

function openChatDb(dbPath: string): InstanceType<typeof Database> {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  // WhatsApp writes this DB live (WAL); a busy timeout avoids transient
  // "database is locked" errors that would otherwise show the connector as
  // dropped while the app is mid-write.
  db.pragma('busy_timeout = 3000');
  return db;
}

export async function whatsappStatus(): Promise<ConnectorStatus> {
  const dbPath = resolveChatDb();
  if (!dbPath) {
    return {
      id: 'whatsapp',
      name: 'WhatsApp',
      kind: 'social',
      state: 'not_configured',
      detail: 'ChatStorage.sqlite not found — is the WhatsApp (or WhatsApp Business) desktop app installed and signed in?',
    };
  }
  try {
    const db = openChatDb(dbPath);
    try {
      const chats = (db.prepare('SELECT COUNT(*) AS n FROM ZWACHATSESSION').get() as { n: number }).n;
      const unread = (
        db.prepare('SELECT COALESCE(SUM(ZUNREADCOUNT), 0) AS n FROM ZWACHATSESSION WHERE ZUNREADCOUNT > 0').get() as {
          n: number;
        }
      ).n;
      const mtime = fs.statSync(dbPath).mtime;
      const minutesAgo = Math.max(0, Math.round((Date.now() - mtime.getTime()) / 60_000));
      return {
        id: 'whatsapp',
        name: 'WhatsApp',
        kind: 'social',
        state: 'connected',
        detail: `${chats} chats · ${unread} unread · last activity ${minutesAgo}m ago (local desktop DB, read-only)`,
        meta: { chats, unread, source: dbPath.includes('SMB') ? 'business' : 'consumer' },
      };
    } finally {
      db.close();
    }
  } catch (err) {
    return {
      id: 'whatsapp',
      name: 'WhatsApp',
      kind: 'social',
      state: 'error',
      detail: `ChatStorage.sqlite exists but read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function recentChats(limit = 15): Promise<CommsItem[]> {
  const dbPath = resolveChatDb();
  if (!dbPath) return [];
  const db = openChatDb(dbPath);
  try {
    const maxRaw = (
      db.prepare('SELECT COALESCE(MAX(ZLASTMESSAGEDATE), 0) AS m FROM ZWACHATSESSION').get() as { m: number }
    ).m;
    // ZWACHATSESSION.ZLASTMESSAGETEXT is a protobuf blob and its
    // ZLASTMESSAGEDATE mixes units across rows — ZWAMESSAGE is the source of
    // truth for both text (plaintext) and dates (Core Data seconds).
    const rows = db
      .prepare(
        `SELECT s.ZPARTNERNAME, s.ZLASTMESSAGEDATE, s.ZUNREADCOUNT,
           (SELECT m.ZTEXT FROM ZWAMESSAGE m
            WHERE m.ZCHATSESSION = s.Z_PK AND m.ZTEXT IS NOT NULL
            ORDER BY m.ZMESSAGEDATE DESC LIMIT 1) AS lastText,
           (SELECT MAX(m.ZMESSAGEDATE) FROM ZWAMESSAGE m
            WHERE m.ZCHATSESSION = s.Z_PK) AS lastDate
         FROM ZWACHATSESSION s
         WHERE s.ZPARTNERNAME IS NOT NULL AND (s.ZARCHIVED IS NULL OR s.ZARCHIVED = 0)
         ORDER BY s.ZLASTMESSAGEDATE DESC LIMIT ?`,
      )
      .all(limit) as ChatRow[];
    return rows.map((row) => ({
      source: 'whatsapp' as const,
      title: row.ZPARTNERNAME ?? 'Unknown chat',
      sender: row.ZPARTNERNAME ?? 'Unknown chat',
      preview: (row.lastText ?? '').slice(0, 140),
      ts:
        row.lastDate && row.lastDate > 0
          ? new Date(CORE_DATA_EPOCH_MS + row.lastDate * 1000).toISOString()
          : calibratedDate(row.ZLASTMESSAGEDATE ?? 0, maxRaw).toISOString(),
      unread: row.ZUNREADCOUNT ?? 0,
    }));
  } finally {
    db.close();
  }
}
