// Must match server/src/config/languages.ts (a server test checks both lists).
// To add a language: add it here and on the server, then add locales/<code>.json.

export interface UiLanguage {
  code: string;
  nativeName: string;
  englishName: string;
  /** BCP-47 tag used for speech recognition and synthesis. */
  speechTag: string;
}

export const LANGUAGES: UiLanguage[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', speechTag: 'en-IN' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', speechTag: 'ta-IN' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', speechTag: 'hi-IN' },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', speechTag: 'ml-IN' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', speechTag: 'kn-IN' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', speechTag: 'te-IN' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export function languageInfo(code: string): UiLanguage {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

export function isSupported(code: string | null | undefined): code is string {
  return !!code && LANGUAGE_CODES.includes(code);
}
