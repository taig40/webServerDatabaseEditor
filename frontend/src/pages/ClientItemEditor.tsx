import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, BookOpen, Package } from 'lucide-react';
import ClientItemDetail from '../components/ClientItemDetail';
import { useLanguageStore } from '../store/useLanguageStore';

const ClientItemEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('item_editor.status.connecting'));
  const [itemsLoaded, setItemsLoaded] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // ── Poll server item list (reuses the same YAML data as ItemEditor) ────────
  useEffect(() => {
    let intervalId: any;

    const poll = async () => {
      try {
        const statusRes = await axios.get(`${API_URL}/api/items/status`);
        const { is_loading, message, items_loaded } = statusRes.data;

        let displayMessage = message;
        if (message === "Conectando ao Backend...") {
          displayMessage = t('item_editor.status.connecting');
        } else if (message === "Carregando lista de Itens...") {
          displayMessage = t('item_editor.status.loading_list');
        }
        setLoadingStatus(displayMessage);
        setItemsLoaded(items_loaded);

        if (!is_loading && message !== 'Aguardando inicialização...') {
          clearInterval(intervalId);
          setLoadingStatus(t('item_editor.status.loading_list'));
          try {
            const res = await axios.get(`${API_URL}/api/items/?skip=0&limit=150000`);
            setItems(res.data.items);
            setIsLoading(false);
          } catch {
            setLoadingStatus(t('item_editor.status.error_final_array'));
          }
        }
      } catch {
        setLoadingStatus(t('item_editor.status.offline'));
      }
    };

    poll();
    intervalId = setInterval(poll, 1000);
    return () => clearInterval(intervalId);
  }, [t]);

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.Id - b.Id);
    if (!searchText) return sorted;
    const lower = searchText.toLowerCase();
    return sorted.filter(
      (item) =>
        String(item.Id).includes(lower) ||
        (item.Name && item.Name.toLowerCase().includes(lower)) ||
        (item.AegisName && item.AegisName.toLowerCase().includes(lower)),
    );
  }, [items, searchText]);

  const selectedItem = useMemo(
    () => (selectedItemId === null ? null : items.find((i) => i.Id === selectedItemId) ?? null),
    [items, selectedItemId],
  );

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async (itemId: number, fields: Record<string, any>) => {
    try {
      await axios.put(`${API_URL}/api/client_items/${itemId}`, fields);
      return true;
    } catch (err) {
      console.error('[webSDE] Falha ao salvar client item', err);
      alert(t('client_item_editor.save_error'));
      return false;
    }
  }, [t]);

  return (
    <div className="flex h-full w-full bg-[#0f0f14] overflow-hidden font-sans">

      {/* ── Loading Overlay ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f0f14]/90 backdrop-blur-sm">
          <div className="w-14 h-14 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-6" />
          <h3 className="text-xl text-white font-semibold mb-2">{t('client_item_editor.loading_title')}</h3>
          <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
          <div className="bg-[#1a1a28] px-4 py-2 rounded-full border border-white/10">
            <span className="text-cyan-400 font-bold text-lg">{itemsLoaded.toLocaleString()}</span>
            <span className="text-gray-500 ml-2">{t('item_editor.status.entries_read')}</span>
          </div>
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-[300px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 relative z-10">

        {/* Header */}
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a28] to-[#12121a]">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-cyan-400" />
            <h2 className="text-gray-200 font-semibold text-sm">{t('client_item_editor.sidebar.title')}</h2>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder={t('item_editor.search_placeholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-[#0f0f14] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>
          <div className="text-[10px] text-gray-600 mt-2 font-mono">
            {t('client_item_editor.sidebar.items_count', { count: filteredItems.length })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden">
          {!isLoading && (
            <Virtuoso
              data={filteredItems}
              style={{ height: '100%' }}
              itemContent={(_index, item) => {
                const isActive = selectedItemId === item.Id;
                return (
                  <div
                    onClick={() => setSelectedItemId(item.Id)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-white/5 transition-all duration-100 ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-600/20 to-transparent border-l-2 border-l-cyan-500'
                        : 'hover:bg-white/5 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-[#0f0f14] rounded border border-white/10 flex items-center justify-center overflow-hidden p-1">
                      <img
                        src={`${API_URL}/api/grf/sprite?type=item&id=${item.Id}`}
                        alt=""
                        className="max-w-full max-h-full"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        loading="lazy"
                      />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-xs truncate font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
                        {item.Name || item.AegisName || t('item_editor.unknown')}
                      </span>
                      <span className={`text-[10px] font-mono truncate ${isActive ? 'text-cyan-400' : 'text-gray-600'}`}>
                        {item.Id} · {item.AegisName}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {selectedItem ? (
          <ClientItemDetail item={selectedItem} onSave={handleSave} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <Package size={56} className="mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-gray-500">{t('client_item_editor.no_selection.title')}</h3>
            <p className="text-sm mt-1">{t('client_item_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default ClientItemEditor;
