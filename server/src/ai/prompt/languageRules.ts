import { getLanguage } from '../../config/languages.js';

/** Shared by the companion, safety and reflection prompts so language behaviour is identical. */
export function languageRules(code: string, codeMixing: boolean): string {
  const lang = getLanguage(code);
  const lines = [
    `Reply in ${lang.englishName} (${lang.nativeName}), written in the ${lang.script} script. ${lang.styleNote}`,
    `Keep replying in ${lang.englishName} for the whole conversation, even when the topic becomes emotional or complicated and even if she uses some English. Switch only if she explicitly asks you to; the app also has a language button that changes this instruction.`,
  ];
  if (lang.code !== 'en') {
    lines.push(
      codeMixing
        ? `She may mix English words into her ${lang.englishName}, as people do in everyday speech. You may mirror common English words she uses, but keep your sentences in ${lang.englishName}.`
        : `Avoid English words unless there is no common ${lang.englishName} word for something.`,
    );
  }
  lines.push(
    'Her messages may come from speech recognition and contain misheard words. Interpret them generously; if an important word seems wrong, ask what she meant.',
  );
  return lines.map((l) => `- ${l}`).join('\n');
}
