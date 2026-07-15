import { describe, expect, test } from 'vitest';
import { parseEnvFile, extractMcpEnvKey } from '@/lib/creds';

describe('parseEnvFile', () => {
  test('parses KEY=value lines and ignores comments and blanks', () => {
    const content = [
      '# Zernio',
      'ZERNIO_API_KEY=zk_live_abc123',
      '',
      'export MIRO_ACCESS_TOKEN=mt-456',
      'EMPTY=',
      'QUOTED="with spaces"',
      "SINGLE='single'",
    ].join('\n');
    const parsed = parseEnvFile(content);
    expect(parsed.ZERNIO_API_KEY).toBe('zk_live_abc123');
    expect(parsed.MIRO_ACCESS_TOKEN).toBe('mt-456');
    expect(parsed.EMPTY).toBe('');
    expect(parsed.QUOTED).toBe('with spaces');
    expect(parsed.SINGLE).toBe('single');
    expect(Object.keys(parsed)).not.toContain('# Zernio');
  });

  test('keeps = signs inside values', () => {
    expect(parseEnvFile('AUTH=Basic dXNlcjpwYXNz==').AUTH).toBe('Basic dXNlcjpwYXNz==');
  });
});

describe('extractMcpEnvKey', () => {
  test('pulls an env value out of a claude.json mcpServers entry', () => {
    const claudeJson = {
      mcpServers: {
        attio: { command: 'npx', args: ['attio-mcp'], env: { ATTIO_API_KEY: 'att_secret' } },
      },
    };
    expect(extractMcpEnvKey(claudeJson, 'attio', 'ATTIO_API_KEY')).toBe('att_secret');
  });

  test('returns undefined when the server or key is missing', () => {
    expect(extractMcpEnvKey({}, 'attio', 'ATTIO_API_KEY')).toBeUndefined();
    expect(extractMcpEnvKey({ mcpServers: { attio: {} } }, 'attio', 'ATTIO_API_KEY')).toBeUndefined();
  });
});
