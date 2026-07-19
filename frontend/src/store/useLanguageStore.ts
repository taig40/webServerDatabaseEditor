import { create } from 'zustand';
import enUS from '../locales/en-US.json';
import ptBR from '../locales/pt-BR.json';

export type Language = 'pt-BR' | 'en-US';

/**
 * Constructs a union of all dot-notation key paths for a given nested object type,
 * up to a configurable depth. Used to produce the {@link TranslationKey} union.
 */
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

/** Union of all valid dot-notation translation keys derived from `en-US.json`. */
export type TranslationKey = Paths<typeof enUS>;

const translations: Record<Language, any> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};

interface LanguageState {
  language: Language;
  /** Updates the active language and persists the selection to localStorage. */
  setLanguage: (lang: Language) => void;
  /**
   * Resolves a dot-notation translation key to a localized string.
   * Falls back to English if the key is missing in the active locale.
   * Falls back to the raw key string if the key is missing in both locales.
   *
   * @param key - Dot-notation key (e.g. `"settings.database.title"`).
   * @param variables - Optional interpolation map for `{{key}}` / `{key}` placeholders.
   */
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
}

/**
 * Global i18n store.
 *
 * Provides the active language, a `setLanguage` action, and a `t()` translation
 * function.  The initial language is restored from `localStorage` on first mount,
 * defaulting to `pt-BR`.
 *
 * @example
 * ```ts
 * const { t, language, setLanguage } = useLanguageStore();
 * console.log(t('settings.title'));
 * ```
 */
export const useLanguageStore = create<LanguageState>((set, get) => {
  const initialLang = (localStorage.getItem('app-language') as Language) || 'pt-BR';

  return {
    language: initialLang,

    setLanguage: (lang: Language) => {
      localStorage.setItem('app-language', lang);
      set({ language: lang });
    },

    t: (key: TranslationKey, variables?: Record<string, string | number>) => {
      const currentLang = get().language;
      const dict = translations[currentLang] || translations['pt-BR'];

      // Resolve the value at the given dot-notation path
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

      // Fall back to English if the key is not found in the active locale
      if (typeof result !== 'string') {
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

      // Interpolate {{key}} and {key} placeholders with the provided variables
      if (variables) {
        let str = result;
        Object.entries(variables).forEach(([vKey, vVal]) => {
          str = str.replace(new RegExp(`\\{\\{${vKey}\\}\\}`, 'g'), String(vVal));
          str = str.replace(new RegExp(`\\{${vKey}\\}`, 'g'), String(vVal));
        });
        return str;
      }

      return result;
    },
  };
});
