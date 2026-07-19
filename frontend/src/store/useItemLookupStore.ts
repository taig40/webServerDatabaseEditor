import { create } from 'zustand';
import axios from 'axios';
import { API_URL } from '../config/env';

interface ItemLookupState {
  /** Bidirectional map: numeric string ID → AegisName. */
  idToAegis: Record<string, string>;
  /** Bidirectional map: AegisName (upper and original case) → numeric string ID. */
  aegisToId: Record<string, string>;
  isLoaded: boolean;
  isLoading: boolean;
  /**
   * Fetches the full ID↔AegisName lookup table from the backend and populates
   * both `idToAegis` and `aegisToId`. No-ops if a fetch is already in progress.
   */
  fetchLookup: () => Promise<void>;
  /**
   * Resolves an input value to its AegisName string.
   * Numeric inputs are looked up in `idToAegis`; AegisName strings are returned as-is.
   *
   * @returns The resolved AegisName, or `null` if the input is empty/unresolvable.
   */
  resolveAegis: (idOrAegis: string | number | undefined | null) => string | null;
  /**
   * Resolves an input value to its numeric item ID string.
   * Numeric inputs are returned as-is; AegisName strings are looked up in `aegisToId`.
   *
   * @returns The resolved ID string, or `null` if unresolvable.
   */
  resolveId: (idOrAegis: string | number | undefined | null) => string | null;
  /**
   * Formats an ID or AegisName into a hybrid `"value (other)"` display string
   * (e.g. `"501 (Red_Potion)"` or `"Red_Potion (501)"`).
   *
   * @returns Empty string if the input is null/undefined/empty.
   */
  formatHybrid: (idOrAegis: string | number | undefined | null) => string;
}

/**
 * Global item ID ↔ AegisName lookup store.
 *
 * Populated lazily on first use via {@link ItemLookupState.fetchLookup}.
 * Provides helper methods for resolving IDs, AegisNames, and hybrid display strings
 * throughout the application without per-component API calls.
 *
 * @example
 * ```ts
 * const { resolveAegis, formatHybrid } = useItemLookupStore();
 * console.log(resolveAegis(501));        // "Red_Potion"
 * console.log(formatHybrid('Red_Potion')); // "Red_Potion (501)"
 * ```
 */
export const useItemLookupStore = create<ItemLookupState>((set, get) => ({
  idToAegis: {},
  aegisToId: {},
  isLoaded: false,
  isLoading: false,

  fetchLookup: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await axios.get(`${API_URL}/api/items/lookup`);
      const map: Record<string, string> = res.data || {};
      const reverseMap: Record<string, string> = {};

      Object.entries(map).forEach(([idStr, aegis]) => {
        if (aegis) {
          reverseMap[aegis.toUpperCase()] = idStr;
          reverseMap[aegis] = idStr;
        }
      });

      set({
        idToAegis: map,
        aegisToId: reverseMap,
        isLoaded: true,
        isLoading: false,
      });
    } catch (err) {
      console.error('[ItemLookupStore] Erro ao carregar lookup de itens:', err);
      set({ isLoading: false });
    }
  },

  resolveAegis: (input) => {
    if (input === undefined || input === null || input === '') return null;
    const str = String(input).trim();
    const { idToAegis } = get();

    if (/^\d+$/.test(str)) {
      return idToAegis[str] || null;
    }
    return str;
  },

  resolveId: (input) => {
    if (input === undefined || input === null || input === '') return null;
    const str = String(input).trim();
    const { aegisToId } = get();

    if (/^\d+$/.test(str)) {
      return str;
    }
    return aegisToId[str.toUpperCase()] || aegisToId[str] || null;
  },

  formatHybrid: (input) => {
    if (input === undefined || input === null || input === '') return '';
    const str = String(input).trim();
    const { idToAegis, aegisToId } = get();

    if (/^\d+$/.test(str)) {
      const aegis = idToAegis[str];
      return aegis ? `${str} (${aegis})` : str;
    }

    const id = aegisToId[str.toUpperCase()] || aegisToId[str];
    return id ? `${str} (${id})` : str;
  },
}));
