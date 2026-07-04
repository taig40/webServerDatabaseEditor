import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Plus, Package, Database, Sparkles } from 'lucide-react';

import NewItemModal from '../components/NewItemModal';
import ItemDetail from '../components/ItemDetail';

type SourceTab = 'rathena' | 'custom';

const ItemEditor: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Status de carregamento para arquivos YAML
  const [loadingStatus, setLoadingStatus] = useState("Conectando ao Backend...");
  const [itemsLoaded, setItemsLoaded] = useState(0);
  
  // Estado para o campo de busca
  const [searchText, setSearchText] = useState("");
  
  // Aba de origem
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');

  // Modal de novo item
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Item Selecionado
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  useEffect(() => {
    let intervalId: any;

    const checkStatusAndFetch = async () => {
      try {
        const statusRes = await axios.get(`${API_URL}/api/items/status`);
        const { is_loading, message, items_loaded } = statusRes.data;
        
        setLoadingStatus(message);
        setItemsLoaded(items_loaded);

        if (!is_loading && message !== "Aguardando inicialização...") {
          if (intervalId) clearInterval(intervalId);
          
          setLoadingStatus("Carregando lista de Itens...");
          try {
             const itemsRes = await axios.get(`${API_URL}/api/items/?skip=0&limit=150000`);
             setItems(itemsRes.data.items);
             setIsLoading(false);
          } catch (err) {
             console.error("Erro ao baixar array final:", err);
             setLoadingStatus("Erro ao receber os itens finais.");
          }
        }
      } catch (err) {
        console.error("Erro ao checar status. Servidor offline?", err);
        setLoadingStatus("Servidor offline. Tentando reconectar...");
      }
    };

    checkStatusAndFetch();
    intervalId = setInterval(checkStatusAndFetch, 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Separate items by source, then sort by Id
  const rathenaItems = useMemo(() =>
    [...items.filter(i => i._source !== 'custom')].sort((a, b) => a.Id - b.Id),
    [items]
  );
  const customItems = useMemo(() =>
    [...items.filter(i => i._source === 'custom')].sort((a, b) => a.Id - b.Id),
    [items]
  );

  const activeItems = sourceTab === 'rathena' ? rathenaItems : customItems;

  const filteredItems = useMemo(() => {
    if (!searchText) return activeItems;
    const lower = searchText.toLowerCase().trim();

    if (lower.startsWith('[script]')) {
      let query = lower.slice(8).trim();
      if (query.startsWith(':')) {
        query = query.slice(1).trim();
      }
      return activeItems.filter(item =>
        (item.Script && String(item.Script).toLowerCase().includes(query)) ||
        (item.EquipScript && String(item.EquipScript).toLowerCase().includes(query)) ||
        (item.UnequipScript && String(item.UnequipScript).toLowerCase().includes(query))
      );
    }

    return activeItems.filter(item =>
      String(item.Id).includes(lower) ||
      (item.Name && item.Name.toLowerCase().includes(lower)) ||
      (item.AegisName && item.AegisName.toLowerCase().includes(lower))
    );
  }, [activeItems, searchText]);

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
      alert("Erro de conexão ao salvar a alteração no YAML.");
      return false;
    }
  }, []);

  return (
    <div className="flex h-full w-full bg-dark-950 overflow-hidden font-sans">
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900/90 backdrop-blur-sm">
           <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-6"></div>
           <h3 className="text-2xl text-white font-semibold mb-2">Carregando Banco de Itens</h3>
           <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
           <div className="bg-dark-800 px-4 py-2 rounded-full border border-white/10">
              <span className="text-violet-400 font-bold text-lg">{itemsLoaded.toLocaleString()}</span>
              <span className="text-gray-500 ml-2">entradas lidas</span>
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
              <Package size={18} className="text-violet-500" /> Itens
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 rounded transition-colors"
              title="Novo Item"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Source Tabs */}
          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedItemId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-violet-600/80 text-white shadow-md shadow-violet-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} />
              rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaItems.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedItemId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} />
              Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {customItems.length.toLocaleString()}
              </span>
            </button>
          </div>
          
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por ID, Nome..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
          <div className="text-[11px] text-gray-500 mt-2 font-mono flex justify-between">
            <span>Resultados: {filteredItems.length.toLocaleString()}</span>
            <span>Total: {items.length.toLocaleString()}</span>
          </div>
        </div>

        {/* Virtualized List */}
        <div className="flex-1 overflow-hidden">
          {!isLoading && (
            <Virtuoso
              data={filteredItems}
              style={{ height: '100%' }}
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
                      <img 
                        src={`${API_URL}/api/grf/sprite?type=item&id=${item.Id}`} 
                        alt="" 
                        className="max-w-full max-h-full drop-shadow-md"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        loading="lazy"
                      />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-sm truncate font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {item.Name || item.AegisName || 'Unknown'}
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
            <h3 className="text-xl font-medium text-gray-400">Nenhum Item Selecionado</h3>
            <p className="text-sm mt-2">Selecione um item na lista ao lado para ver os detalhes e editá-lo.</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default ItemEditor;
