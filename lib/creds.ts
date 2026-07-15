import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Credential resolution for connectors. Alex's keys already live in
 * canonical locations around the machine (~/.config/social/.env,
 * knowledge/.env, ~/.config/mcp.json, project .env files). Connectors
 * resolve from process.env first, then fall back to those files at runtime —
 * no secrets are ever copied into this repo.
 */

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const stripped = line.startsWith('export ') ? line.slice(7) : line;
    const eq = stripped.indexOf('=');
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function extractMcpEnvKey(claudeJson: unknown, server: string, key: string): string | undefined {
  const servers = (claudeJson as { mcpServers?: Record<string, { env?: Record<string, string> }> })
    ?.mcpServers;
  return servers?.[server]?.env?.[key];
}

const HOME = os.homedir();

export const CRED_FILES = {
  socialMedia: path.join(HOME, '.config/social', '.env'),
  agentsEnv: path.join(HOME, 'knowledge', '.env.agents'),
  arcads: path.join(HOME, 'Projects', 'arcads', '.env'),
  claudeJson: path.join(HOME, '.config/mcp.json'),
};

function readEnvFileSafe(filePath: string): Record<string, string> {
  try {
    return parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/** process.env first, then each env file in order. */
export function resolveCred(name: string, files: string[]): string | undefined {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  for (const file of files) {
    const value = readEnvFileSafe(file)[name];
    if (value) return value;
  }
  return undefined;
}

export function resolveAttioKey(): string | undefined {
  if (process.env.ATTIO_API_KEY) return process.env.ATTIO_API_KEY;
  try {
    const claudeJson = JSON.parse(fs.readFileSync(CRED_FILES.claudeJson, 'utf8'));
    return extractMcpEnvKey(claudeJson, 'attio', 'ATTIO_API_KEY');
  } catch {
    return undefined;
  }
}
