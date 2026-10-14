// Supported conversation languages. To add a language, add an entry here AND in
// client/src/lib/i18n/languages.ts (a test checks both lists stay in sync), then
// add client/src/lib/i18n/locales/<code>.json.

export interface LanguageInfo {
  code: string;
  englishName: string;
  nativeName: string;
  script: string;
  /** Register/tone guidance passed to the model. */
  styleNote: string;
}

export const LANGUAGES = [
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    script: 'Latin',
    styleNote:
      'Use simple, warm, everyday Indian English. Avoid jargon, therapy-speak and American slang.',
  },
  {
    code: 'ta',
    englishName: 'Tamil',
    nativeName: 'தமிழ்',
    script: 'Tamil',
    styleNote:
      'Use warm, natural spoken Tamil (பேச்சுத் தமிழ்) as people talk at home, not formal or literary Tamil. Stay respectful (use நீங்க).',
  },
  {
    code: 'hi',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'Devanagari',
    styleNote:
      'Use simple everyday Hindi as spoken at home, not heavily Sanskritised or formal Hindi. Address her respectfully with "aap" (आप) and use feminine forms when addressing her. When referring to yourself, use feminine grammatical forms (e.g. "समझ सकती हूँ"), matching the app interface, and keep them consistent.',
  },
  {
    code: 'ml',
    englishName: 'Malayalam',
    nativeName: 'മലയാളം',
    script: 'Malayalam',
    styleNote:
      'Use natural, conversational Malayalam as spoken at home, not bookish Malayalam. Stay warm and respectful.',
  },
  {
    code: 'kn',
    englishName: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    script: 'Kannada',
    styleNote:
      'Use natural, conversational Kannada as spoken at home, not formal written Kannada. Address her respectfully (ನೀವು).',
  },
  {
    code: 'te',
    englishName: 'Telugu',
    nativeName: 'తెలుగు',
    script: 'Telugu',
    styleNote:
      'Use natural, conversational Telugu as spoken at home, not formal written Telugu. Address her respectfully (మీరు).',
  },
] as const satisfies readonly LanguageInfo[];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function getLanguage(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function isSupportedLanguage(code: string): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code);
}
