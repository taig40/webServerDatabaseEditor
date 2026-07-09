import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Plus, Package, Database, Sparkles } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';

import NewItemModal from '../components/NewItemModal';
import ItemDetail from '../components/ItemDetail';
import { ItemIcon } from '../components/ItemIcon';
import { localizeLoadingStatus } from '../utils/i18nHelpers';

type SourceTab = 'rathena' | 'custom';

const ItemEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  // Status de carregamento para arquivos YAML
  const [loadingStatus, setLoadingStatus] = useState(t('item_editor.status.connecting'));
  const [itemsLoaded, setItemsLoaded] = useState(0);
  
  // Estado para a barra de pesquisa
  const [searchText, setSearchText] = useState("");
  const [searchTarget, setSearchTarget] = useState<"name" | "script">("name");
  const [searchType, setSearchType] = useState("all");

  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [appliedSearchTarget, setAppliedSearchTarget] = useState<"name" | "script">("name");
  const [appliedSearchType, setAppliedSearchType] = useState("all");
  
  // Aba de origem
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');

  // Referência para rolar a lista virtualizada de volta ao topo
  const virtuosoRef = React.useRef<VirtuosoHandle>(null);

  // Modal de novo item
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Item Selecionado
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // Limpeza explícita de memória RAM na desmontagem
  useEffect(() => {
    return () => {
      setItems([]);
    };
  }, []);

  const fetchItemsPage = useCallback(async (
    targetPage: number,
    replace: boolean = false,
    overrideParams?: {
      searchQuery?: string;
      searchTarget?: "name" | "script";
      searchType?: string;
      source?: SourceTab;
    }
  ) => {
    try {
      if (targetPage > 1) setIsLoadingMore(true);
      const query = overrideParams?.searchQuery !== undefined ? overrideParams.searchQuery : appliedSearchQuery;
      const target = overrideParams?.searchTarget !== undefined ? overrideParams.searchTarget : appliedSearchTarget;
      const typeVal = overrideParams?.searchType !== undefined ? overrideParams.searchType : appliedSearchType;
      const src = overrideParams?.source !== undefined ? overrideParams.source : sourceTab;

      const res = await axios.get(`${API_URL}/api/items/`, {
        params: {
          page: targetPage,
          limit: 50,
          search_query: query,
          search_target: target,
          item_type: typeVal === 'all' ? '' : typeVal,
          source: src
        }
      });
      const data = res.data;
      const newItems = data.items || [];
      if (replace) {
        setItems(newItems);
      } else {
        setItems(prev => [...prev, ...newItems]);
      }
      setTotalCount(data.total_count || 0);
      setHasMore(Boolean(data.has_more));
      setPage(targetPage);
    } catch (err) {
      console.error("[ItemEditor] Erro na busca paginada:", err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [appliedSearchQuery, appliedSearchTarget, appliedSearchType, sourceTab]);

  const handleSearch = useCallback(async () => {
    setAppliedSearchQuery(searchText);
    setAppliedSearchTarget(searchTarget);
    setAppliedSearchType(searchType);
    setIsLoading(true);
    setPage(1);
    virtuosoRef.current?.scrollToIndex({ index: 0 });
    await fetchItemsPage(1, true, {
      searchQuery: searchText,
      searchTarget: searchTarget,
      searchType: searchType,
      source: sourceTab
    });
  }, [searchText, searchTarget, searchType, sourceTab, fetchItemsPage]);

  const handleSourceChange = useCallback(async (newSource: SourceTab) => {
    setSourceTab(newSource);
    setSelectedItemId(null);
    setIsLoading(true);
    setPage(1);
    virtuosoRef.current?.scrollToIndex({ index: 0 });
    await fetchItemsPage(1, true, {
      searchQuery: appliedSearchQuery,
      searchTarget: appliedSearchTarget,
      searchType: appliedSearchType,
      source: newSource
    });
  }, [appliedSearchQuery, appliedSearchTarget, appliedSearchType, fetchItemsPage]);

  useEffect(() => {
    let intervalId: any;

    const checkStatusAndFetch = async () => {
      try {
        const statusRes = await axios.get(`${API_URL}/api/items/status`);
        const { is_loading, message, items_loaded } = statusRes.data;
        
        setLoadingStatus(localizeLoadingStatus(message, t));
        setItemsLoaded(items_loaded);

        if (!is_loading && message !== "Aguardando inicialização...") {
          if (intervalId) clearInterval(intervalId);
          setIsLoading(true);
          await fetchItemsPage(1, true);
        }
      } catch (err) {
        console.error("Erro ao checar status. Servidor offline?", err);
        setLoadingStatus(t('item_editor.status.offline'));
      }
    };

    checkStatusAndFetch();
    intervalId = setInterval(checkStatusAndFetch, 1000);

    return () => clearInterval(intervalId);
  }, [fetchItemsPage]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading) {
      fetchItemsPage(page + 1, false);
    }
  }, [hasMore, isLoadingMore, isLoading, page, fetchItemsPage]);

  const selectedItem = useMemo(() => {
    if (selectedItemId === null) return null;
    return items.find(i => i.Id === selectedItemId) || null;
  }, [items, selectedItemId]);

  const handleUpdateItem = useCallback(async (itemId: number, updatedData: any, saveMode: 'import' | 'overwrite' = 'import') => {
    try {
      // Remove metadata keys before sending to backend
      const payload = { ...updatedData };
      delete payload._source;
      delete payload.Id;

      // Otimisticamente atualiza o estado
      setItems(prev => prev.map(it => it.Id === itemId ? { ...it, ...updatedData } : it));
      
      // Salva no backend
      const res = await axios.put(`${API_URL}/api/items/${itemId}?save_mode=${saveMode}`, payload);
      
      // Update item with exact backend response (including new _source if changed)
      if (res.data) {
        setItems(prev => prev.map(it => it.Id === itemId ? { ...it, ...res.data } : it));
      }
      console.log(`[webSDE] Item ${itemId} atualizado com sucesso! (Modo: ${saveMode})`);
      return true;
    } catch (error) {
      console.error("[webSDE] Falha ao salvar", error);
      alert(t('item_editor.status.save_error'));
      return false;
    }
  }, []);

  return (
    <div className="flex h-full w-full bg-dark-950 overflow-hidden font-sans">
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900/90 backdrop-blur-sm">
           <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h3 className="text-2xl text-white font-semibold mb-2">{t('item_editor.status.loading_title')}</h3>
            <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
            <div className="bg-dark-800 px-4 py-2 rounded-full border border-white/10">
               <span className="text-violet-400 font-bold text-sm">
                 {t('loading.entriesRead', { count: itemsLoaded })}
               </span>
            </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <NewItemModal 
          onClose={() => setIsModalOpen(false)} 
          onItemCreated={(newItem) => {
             setItems(prev => [newItem, ...prev]);
             setSelectedItemId(newItem.Id);
             setIsModalOpen(false);
             setSourceTab('custom');
          }}
        />
      )}

      {/* Master View (Sidebar) */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        
        {/* Search Header */}
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Package size={18} className="text-violet-500" /> {t('item_editor.title')}
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 rounded transition-colors"
              title={t('item_editor.new_item')}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Source Tabs */}
          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => handleSourceChange('rathena')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-violet-600/80 text-white shadow-md shadow-violet-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} />
              rAthena
            </button>
            <button
              onClick={() => handleSourceChange('custom')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} />
              Custom
            </button>
          </div>
          
          {/* Advanced Search Bar */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={searchTarget}
                onChange={(e) => setSearchTarget(e.target.value as "name" | "script")}
                className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-500/50 transition-colors"
              >
                <option value="name">{t('item_editor.search_target.name')}</option>
                <option value="script">{t('item_editor.search_target.script')}</option>
              </select>

              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-500/50 transition-colors"
              >
                <option value="all">{t('item_editor.search_type.all')}</option>
                <option value="Weapon">{t('item_editor.search_type.weapon')}</option>
                <option value="Armor">{t('item_editor.search_type.armor')}</option>
                <option value="Consumable">{t('item_editor.search_type.consumable')}</option>
                <option value="Healing">{t('item_editor.search_type.healing')}</option>
                <option value="Usable">{t('item_editor.search_type.usable')}</option>
                <option value="Card">{t('item_editor.search_type.card')}</option>
                <option value="Ammo">{t('item_editor.search_type.ammo')}</option>
                <option value="Etc">{t('item_editor.search_type.etc')}</option>
                <option value="PetEgg">{t('item_editor.search_type.petegg')}</option>
                <option value="PetArmor">{t('item_editor.search_type.petarmor')}</option>
              </select>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder={t('item_editor.search_placeholder')}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
              <button
                onClick={handleSearch}
                className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-violet-900/30 transition-all duration-150 shrink-0"
              >
                <Search size={13} />
                {t('item_editor.search_btn')}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 mt-2 font-mono flex justify-between">
            <span>{t('pagination.showing', { loaded: items.length.toLocaleString(), total: totalCount.toLocaleString() })}</span>
          </div>
        </div>

        {/* Virtualized List */}
        <div className="flex-1 overflow-hidden">
          {!isLoading && (
            <Virtuoso
              ref={virtuosoRef}
              data={items}
              endReached={handleEndReached}
              style={{ height: '100%' }}
              components={{
                Footer: () => isLoadingMore ? (
                  <div className="p-3 text-center text-xs text-violet-400 font-mono animate-pulse">
                    {t('pagination.loading_more')}
                  </div>
                ) : null
              }}
              itemContent={(index, item) => {
                const isSelected = selectedItemId === item.Id;
                const isCustom = item._source === 'custom';
                return (
                  <div 
                    onClick={() => setSelectedItemId(item.Id)}
                    className={`flex items-center gap-3 p-3 cursor-pointer border-b border-white/5 transition-all duration-150 ${
                      isSelected 
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-violet-600/20 to-transparent border-l-2 border-l-violet-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-dark-900 rounded border border-white/10 flex items-center justify-center overflow-hidden p-1 shadow-inner">
                      <ItemIcon itemId={item.Id} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-sm truncate font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {item.identifiedDisplayName || item.Name || item.AegisName || t('item_editor.unknown')}
                      </span>
                      <span className={`text-[11px] truncate font-mono ${isSelected ? (isCustom ? 'text-emerald-300' : 'text-violet-300') : 'text-gray-500'}`}>
                        {item.Id} - {item.AegisName}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Detail View (Main) */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-hidden relative">
        {selectedItem ? (
          <ItemDetail item={selectedItem} onUpdate={handleUpdateItem} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Package size={64} className="mb-4 opacity-20" />
            <h3 className="text-xl font-medium text-gray-400">{t('item_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2">{t('item_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default ItemEditor;
