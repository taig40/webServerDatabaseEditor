import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, BookOpen, Package, Plus } from 'lucide-react';
import { ClientItemWorkspace } from '../components/ClientItemWorkspace';
import ClientAssetAudit from '../components/ClientAssetAudit';
import { ItemIcon } from '../components/ItemIcon';
import { useLanguageStore } from '../store/useLanguageStore';
import { localizeLoadingStatus } from '../utils/i18nHelpers';
import { toast } from '../store/useToastStore';

const ClientItemEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [activeTab, setActiveTab] = useState<'editor' | 'audit'>('editor');
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('item_editor.status.connecting'));
  const [itemsLoaded, setItemsLoaded] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isDraftMode, setIsDraftMode] = useState(false);  // Draft Mode: criação via POST

  // ── Poll server item list (reuses the same YAML data as ItemEditor) ────────
  useEffect(() => {
    let intervalId: any;

    const poll = async () => {
      try {
        const statusRes = await axios.get(`${API_URL}/api/items/status`);
        const { is_loading, message, items_loaded } = statusRes.data;

        setLoadingStatus(localizeLoadingStatus(message, t));
        setItemsLoaded(items_loaded);

        if (!is_loading && message !== 'Aguardando inicialização...') {
          clearInterval(intervalId);
          setLoadingStatus(t('loading.loadingItems'));
          try {
            const res = await axios.get(`${API_URL}/api/client_items/`);
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
      
      // Update local state so that edits are immediately reflected
      setItems(prevItems => 
        prevItems.map(item => 
          item.Id === itemId ? { ...item, ...fields } : item
        )
      );
      
      return true;
    } catch (err) {
      console.error('[webSDE] Falha ao salvar client item', err);
      toast.error(t('client_item_editor.save_error'));
      return false;
    }
  }, [t]);

  const handleLocalItemUpdate = useCallback((itemId: number, newClassNum: number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.Id === itemId ? { ...item, ClassNum: newClassNum } : item
      )
    );
  }, []);

  // ── Create handler (POST) ─────────────────────────────────────────────────
  const handleCreate = useCallback(async (itemId: number, fields: Record<string, any>) => {
    try {
      await axios.post(`${API_URL}/api/client_items/`, { item_id: itemId, ...fields });
      // Adicionar o novo item ao array local para aparecer na lista virtualizada
      setItems(prev => [
        ...prev,
        {
          Id: itemId,
          AegisName: '',
          Name: '',
          identifiedDisplayName: fields.identifiedDisplayName || '',
        },
      ]);
      setIsDraftMode(false);
      setSelectedItemId(itemId);
      return true;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        toast.error(t('client_item_editor.create_duplicate_error'));
      } else {
        toast.error(t('client_item_editor.create_error'));
      }
      return false;
    }
  }, [t]);

  // ── Delete handler (DELETE) ────────────────────────────────────────────────
  const handleDelete = useCallback(async (itemId: number) => {
    try {
      await axios.delete(`${API_URL}/api/client_items/${itemId}`);
      // Remove do array local — item some da sidebar sem recarregar a página
      setItems(prev => prev.filter(item => item.Id !== itemId));
      setSelectedItemId(null);
      return true;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        // Item não existia no LUA — remove da lista local mesmo assim
        setItems(prev => prev.filter(item => item.Id !== itemId));
        setSelectedItemId(null);
        return true;
      }
      toast.error(t('client_item_delete.error_generic'));
      return false;
    }
  }, [t]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0f0f14] overflow-hidden font-sans">
      
      {/* ── Tab Switcher ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center px-8 h-12 bg-[#12121a] border-b border-white/5 gap-6">
        <button
          onClick={() => setActiveTab('editor')}
          className={`text-xs font-bold py-3.5 transition-all relative cursor-pointer focus:outline-none ${
            activeTab === 'editor' ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {t('components.client_item_audit.tab_editor')}
          {activeTab === 'editor' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`text-xs font-bold py-3.5 transition-all relative cursor-pointer focus:outline-none ${
            activeTab === 'audit' ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {t('components.client_item_audit.tab_audit')}
          {activeTab === 'audit' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 rounded-full" />
          )}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* ── Loading Overlay ─────────────────────────────────────────────── */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f0f14]/90 backdrop-blur-sm">
            <div className="w-14 h-14 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-6" />
            <h3 className="text-xl text-white font-semibold mb-2">{t('client_item_editor.loading_title')}</h3>
            <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
            <div className="bg-[#1a1a28] px-4 py-2 rounded-full border border-white/10">
              <span className="text-cyan-400 font-bold text-sm">
                {t('loading.entriesRead', { count: itemsLoaded })}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'editor' ? (
          <>
            {/* ── Sidebar ─────────────────────────────────────────────────────── */}
            <div className="w-[300px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 relative z-10">
              {/* Header */}
              <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a28] to-[#12121a]">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-cyan-400" />
                    <h2 className="text-gray-200 font-semibold text-sm">{t('client_item_editor.sidebar.title')}</h2>
                  </div>
                  <button
                    onClick={() => { setIsDraftMode(true); setSelectedItemId(null); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-400 hover:text-violet-300 text-xs font-medium transition-all"
                    title={t('client_item_editor.new_item_btn' as any) || 'Novo Item'}
                  >
                    <Plus size={13} />
                    {t('client_item_editor.new_item_btn' as any) || 'Novo Item'}
                  </button>
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
                          onClick={() => { setSelectedItemId(item.Id); setIsDraftMode(false); }}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-white/5 transition-all duration-100 ${
                            isActive
                              ? 'bg-gradient-to-r from-cyan-600/20 to-transparent border-l-2 border-l-cyan-500'
                              : 'hover:bg-white/5 border-l-2 border-l-transparent'
                          }`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-[#0f0f14] rounded border border-white/10 flex items-center justify-center overflow-hidden p-1">
                            <ItemIcon itemId={item.Id} />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`text-xs truncate font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
                              {item.identifiedDisplayName || item.Name || item.AegisName || t('item_editor.unknown')}
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
              {isDraftMode ? (
                <ClientItemWorkspace
                  item={{ Id: 0, AegisName: '', Name: '' }}
                  onSave={handleSave}
                  onLocalItemUpdate={handleLocalItemUpdate}
                  mode="create"
                  onCreate={handleCreate}
                />
              ) : selectedItem ? (
                <ClientItemWorkspace 
                  item={selectedItem} 
                  onSave={handleSave} 
                  onLocalItemUpdate={handleLocalItemUpdate}
                  mode="edit"
                  onDelete={handleDelete}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                  <Package size={56} className="mb-4 opacity-20" />
                  <h3 className="text-lg font-medium text-gray-500">{t('client_item_editor.no_selection.title')}</h3>
                  <p className="text-sm mt-1">{t('client_item_editor.no_selection.subtitle')}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <ClientAssetAudit onOpenItem={(id) => {
            setSelectedItemId(id);
            setActiveTab('editor');
          }} />
        )}
      </div>
    </div>
  );
};

export default ClientItemEditor;
