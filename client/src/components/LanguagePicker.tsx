import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../lib/i18n/languages';

/** Chips for choosing a language before signing in. */
export function LanguageChips({ value, onChange }: { value: string; onChange(code: string): void }) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="sr-only">{t('lang.choose')}</legend>
      <div className="flex flex-wrap justify-center gap-2">
        {LANGUAGES.map((l) => (
          <label
            key={l.code}
            className={`flex min-h-10 cursor-pointer items-center rounded-full px-4 text-label-md font-medium transition-all has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-container ${
              value === l.code
                ? 'bg-primary-fixed text-on-primary-fixed ring-[1.5px] ring-primary-container'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <input type="radio" name="ui-language" value={l.code} checked={value === l.code} onChange={() => onChange(l.code)} className="sr-only" />
            <span lang={l.code}>{l.nativeName}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
