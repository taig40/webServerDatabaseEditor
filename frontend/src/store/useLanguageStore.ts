import { create } from 'zustand';
import enUS from '../locales/en-US.json';
import ptBR from '../locales/pt-BR.json';

export type Language = 'pt-BR' | 'en-US';

// Deep dot-notation key type extractor
type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}${"" extends P ? "" : "."}${P}`
    : never
  : never;

type Prev = [never, 0, 1, 2, 3, 4, ...never[]];

type Paths<T, D extends number = 5> = [D] extends [never]
  ? never
  : T extends object
  ? {
      [K in keyof T]-?: K extends string | number
        ? `${K}` | Join<K, Paths<T[K], Prev[D]>>
        : never;
    }[keyof T]
  : "";

export type TranslationKey = Paths<typeof enUS>;

const translations: Record<Language, any> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
}

export const useLanguageStore = create<LanguageState>((set, get) => {
  // Read initial language from localStorage or default to pt-BR
  const initialLang = (localStorage.getItem('app-language') as Language) || 'pt-BR';

  return {
    language: initialLang,

    setLanguage: (lang: Language) => {
      localStorage.setItem('app-language', lang);
      set({ language: lang });
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },

    t: (key: TranslationKey, variables?: Record<string, string | number>) => {
      const currentLang = get().language;
      const dict = translations[currentLang] || translations['pt-BR'];

      // Dot-notation lookup (e.g. 'settings.database.title')
      const keys = key.split('.');
      let result: any = dict;
      for (const k of keys) {
        if (result && typeof result === 'object' && k in result) {
          result = result[k];
        } else {
          result = undefined;
          break;
        }
      }

      if (typeof result !== 'string') {
        // Fallback to English if not found
        let fallbackResult: any = translations['en-US'];
        for (const k of keys) {
          if (fallbackResult && typeof fallbackResult === 'object' && k in fallbackResult) {
            fallbackResult = fallbackResult[k];
          } else {
            fallbackResult = undefined;
            break;
          }
        }
        if (typeof fallbackResult === 'string') {
          result = fallbackResult;
        } else {
          return key;
        }
      }

      // Interpolate variables if provided
      if (variables) {
        let str = result;
        Object.entries(variables).forEach(([vKey, vVal]) => {
          str = str.replace(new RegExp(`{${vKey}}`, 'g'), String(vVal));
        });
        return str;
      }

      return result;
    },
  };
});
