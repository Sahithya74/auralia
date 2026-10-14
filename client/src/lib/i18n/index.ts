import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { KEYS, local } from '../storage';
import { isSupported } from './languages';

// English ships in the main bundle; other languages load on demand.
import en from './locales/en.json';

const lazyLocales = import.meta.glob<{ default: Record<string, unknown> }>(['./locales/*.json', '!./locales/en.json']);

const backend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    if (language === 'en') return callback(null, en);
    const loader = lazyLocales[`./locales/${language}.json`];
    if (!loader) return callback(null, {});
    loader()
      .then((mod) => callback(null, mod.default))
      .catch((err: Error) => callback(err, null));
  },
};

function initialLanguage(): string {
  const saved = local.get(KEYS.uiLanguage);
  if (isSupported(saved)) return saved;
  const browser = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : undefined;
  return isSupported(browser) ? browser : 'en';
}

void i18n
  .use(backend)
  .use(initReactI18next)
  .init({
    lng: initialLanguage(),
    fallbackLng: 'en',
    partialBundledLanguages: true,
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
    returnNull: false,
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  local.set(KEYS.uiLanguage, lng);
});
document.documentElement.lang = i18n.language;

export default i18n;
