import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the privacy architecture: conversation data may only be written through
// src/persistence/memoryGate.ts, which checks the user's memory mode first.

const SRC = path.resolve(import.meta.dirname, '../../src');
const ALLOWED_DIR = path.join(SRC, 'persistence');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const WRITE_CALL = /\.\s*(conversation|message|memory)\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany)\s*\(/;
const RAW_WRITE = /\$(executeRaw|executeRawUnsafe|queryRawUnsafe)\b/;
const NESTED_WRITE = /\b(conversations|messages|memories)\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert)\b/;

describe('privacy architecture', () => {
  const files = sourceFiles(SRC).filter((f) => !f.startsWith(ALLOWED_DIR));

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s does not write conversation data directly', (_rel, file) => {
    const code = readFileSync(file, 'utf8');
    expect(code).not.toMatch(WRITE_CALL);
    expect(code).not.toMatch(RAW_WRITE);
    expect(code).not.toMatch(NESTED_WRITE);
  });

  it('memoryGate checks the policy inside every write transaction', () => {
    const gate = readFileSync(path.join(ALLOWED_DIR, 'memoryGate.ts'), 'utf8');
    const transactions = gate.match(/prisma\.\$transaction\(async \(tx\) => \{\s*const policy = await loadPolicy\(tx, userId\);/g) ?? [];
    const writers = gate.match(/^ {2}async \w+\(/gm) ?? [];
    expect(writers.length).toBeGreaterThan(0);
    expect(transactions.length).toBe(writers.length);
  });
});
