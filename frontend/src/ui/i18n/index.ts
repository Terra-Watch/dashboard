import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import hiExtra from './hi.json';
import orExtra from './or.json';
import { LANGUAGES, resources } from './locales';

type Tree = { [key: string]: string | Tree };
/** The long tail of screen text is kept as flat "dotted.key": "text" files; i18next wants a tree. Hand-written entries in locales.ts win. */
function nest(flat: Record<string, string>, base: Tree): Tree {
  const out: Tree = JSON.parse(JSON.stringify(base));
  for (const [dotted, text] of Object.entries(flat)) {
    const parts = dotted.split('.');
    let node = out;
    parts.slice(0, -1).forEach(part => { const next = node[part]; node = node[part] = typeof next === 'object' ? next : {}; });
    const last = parts[parts.length - 1];
    if (!(last in node)) node[last] = text;
  }
  return out;
}
const merged = {
  en: resources.en,
  hi: { translation: nest(hiExtra, resources.hi.translation as Tree) },
  or: { translation: nest(orExtra, resources.or.translation as Tree) },
};

const supported = LANGUAGES.map(language => language.code);

if (!i18n.isInitialized) {
  void i18n.use(LanguageDetector).use(initReactI18next).init({
    resources: merged, fallbackLng: 'en', supportedLngs: supported, nonExplicitSupportedLngs: true, load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'tw_lang', caches: ['localStorage'] },
  });
  i18n.on('languageChanged', code => { document.documentElement.lang = code.slice(0, 2); });
  document.documentElement.lang = (i18n.language || 'en').slice(0, 2);
}
export default i18n;
