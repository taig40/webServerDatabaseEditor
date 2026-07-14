import { create } from 'zustand';
import axios from 'axios';
import { API_URL } from '../config/env';

interface ItemLookupState {
  idToAegis: Record<string, string>;
  aegisToId: Record<string, string>;
  isLoaded: boolean;
  isLoading: boolean;
  fetchLookup: () => Promise<void>;
  resolveAegis: (idOrAegis: string | number | undefined | null) => string | null;
  resolveId: (idOrAegis: string | number | undefined | null) => string | null;
  formatHybrid: (idOrAegis: string | number | undefined | null) => string;
}

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

    // Se for apenas números (ID), resolve no mapa
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

    // 1. Se for numérico (ex: 25729)
    if (/^\d+$/.test(str)) {
      const aegis = idToAegis[str];
      return aegis ? `${str} (${aegis})` : str;
    }

    // 2. Se for AegisName (ex: Purple_Ferus_Card)
    const id = aegisToId[str.toUpperCase()] || aegisToId[str];
    return id ? `${str} (${id})` : str;
  },
}));
