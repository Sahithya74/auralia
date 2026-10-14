import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLanguage, LANGUAGE_CODES, LANGUAGES } from '../../src/config/languages.js';

const clientLanguages = path.resolve(import.meta.dirname, '../../../client/src/lib/i18n/languages.ts');
const clientLocales = path.resolve(import.meta.dirname, '../../../client/src/lib/i18n/locales');

describe('supported languages', () => {
  it('includes English, Tamil, Hindi, Malayalam, Kannada and Telugu', () => {
    expect([...LANGUAGE_CODES].sort()).toEqual(['en', 'hi', 'kn', 'ml', 'ta', 'te']);
  });

  it('every language has a style note for the model', () => {
    for (const lang of LANGUAGES) expect(lang.styleNote.length).toBeGreaterThan(20);
  });

  it('falls back to English for unknown codes', () => {
    expect(getLanguage('xx').code).toBe('en');
  });

  it.skipIf(!existsSync(clientLanguages))('matches the client language list and locale files', () => {
    const source = readFileSync(clientLanguages, 'utf8');
    const clientCodes = [...source.matchAll(/code: '([a-z]{2})'/g)].map((m) => m[1]);
    expect(clientCodes.sort()).toEqual([...LANGUAGE_CODES].sort());
    for (const code of LANGUAGE_CODES) expect(existsSync(path.join(clientLocales, `${code}.json`))).toBe(true);
  });
});
