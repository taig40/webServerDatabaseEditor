import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Layers, Plus, Database, Sparkles, Save, Trash2, Code2 } from 'lucide-react';
import { ScriptEditor } from '../components/ScriptEditor';
import { useLanguageStore } from '../store/useLanguageStore';
import Select from 'react-select';
import yaml from 'yaml';

const selectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    background: '#12121a',
    borderColor: state.isFocused ? '#06b6d4' : '#374151',
    boxShadow: 'none',
    color: '#e5e7eb',
    '&:hover': { borderColor: '#4b5563' }
  }),
  menu: (base: any) => ({
    ...base,
    background: '#1a1a24',
    border: '1px solid #374151',
    zIndex: 50
  }),
  menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
    color: state.isFocused ? '#67e8f9' : '#9ca3af',
    cursor: 'pointer',
    '&:active': { backgroundColor: 'rgba(6, 182, 212, 0.3)' }
  }),
  multiValue: (base: any) => ({
    ...base,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    border: '1px solid rgba(6, 182, 212, 0.3)',
    borderRadius: '4px'
  }),
  multiValueLabel: (base: any) => ({
    ...base,
    color: '#67e8f9',
    fontSize: '0.75rem',
    fontWeight: '500'
  }),
  multiValueRemove: (base: any) => ({
    ...base,
    color: '#22d3ee',
    cursor: 'pointer',
    ':hover': { backgroundColor: 'rgba(6, 182, 212, 0.3)', color: '#fff' }
  }),
  input: (base: any) => ({ ...base, color: '#e5e7eb' })
};

type SourceTab = 'rathena' | 'custom';

export const ComboEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [combos, setCombos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('combo_editor.status.loading_list'));
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [itemMap, setItemMap] = useState<Record<string, string>>({});
  const [itemOptions, setItemOptions] = useState<{value: string, label: string}[]>([]);

  useEffect(() => {
    fetchCombos();
    fetchItemsMap();
  }, []);

  const fetchItemsMap = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/items/?limit=50000`);
      const items = res.data.items || [];
      const map: Record<string, string> = {};
      const opts: {value: string, label: string}[] = [];
      items.forEach((item: any) => {
        if (item.AegisName) {
          const name = item.Name || item.Name_English || item.AegisName;
          map[item.AegisName.toLowerCase()] = name;
          opts.push({
            value: item.AegisName,
            label: `${name} (${item.AegisName})`
          });
        }
      });
      setItemMap(map);
      setItemOptions(opts);
    } catch (err) {
      console.error("Erro ao carregar mapa de itens:", err);
    }
  };

  const getItemDisplayName = (aegisName: string) => {
    if (!aegisName) return '';
    return itemMap[aegisName.toLowerCase()] || aegisName;
  };

  const fetchCombos = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/combos/?limit=50000`);
      setCombos(res.data.combos || []);
      setIsLoading(false);
    } catch (err) {
      console.error("Erro ao carregar combos:", err);
      setLoadingStatus(t('combo_editor.status.error_fetching'));
      setIsLoading(false);
    }
  };

  const rathenaCombos = useMemo(() => combos.filter(c => c._source === 'rathena'), [combos]);
  const customCombos = useMemo(() => combos.filter(c => c._source === 'custom'), [combos]);

  const filteredCombos = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaCombos : customCombos;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(c => {
      const aegisNames = (c._item_groups || []).flat();
      const friendlyNames = aegisNames.map(name => getItemDisplayName(name));
      const searchBlob = [...aegisNames, ...friendlyNames, String(c.Script || '')].join(' ').toLowerCase();
      return searchBlob.includes(q);
    });
  }, [rathenaCombos, customCombos, sourceTab, searchText, itemMap]);

  const selectedCombo = useMemo(() => {
    return combos.find(c => c._index === selectedIndex) || null;
  }, [combos, selectedIndex]);

  const handleUpdateScript = (script: string) => {
    if (!selectedCombo) return;
    setCombos(prev => prev.map(c => {
      if (c._index === selectedCombo._index) {
        return { ...c, Script: script };
      }
      return c;
    }));
  };

  const handleAddVariant = () => {
    if (!selectedCombo) return;
    const currentGroups = selectedCombo._item_groups || [];
    const updated = [...currentGroups, []];
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: updated } : c));
  };

  const handleRemoveVariant = (idx: number) => {
    if (!selectedCombo) return;
    const currentGroups = selectedCombo._item_groups || [];
    const updated = currentGroups.filter((_, i) => i !== idx);
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: updated } : c));
  };

  const handleUpdateVariant = (varIdx: number, newGroup: string[]) => {
    if (!selectedCombo) return;
    const currentGroups = (selectedCombo._item_groups || []).map((grp: string[], i: number) => {
      if (i === varIdx) return newGroup;
      return grp;
    });
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: currentGroups } : c));
  };

  const handleSaveCombo = async () => {
    if (!selectedCombo) return;
    
    // Front-end Validation min_length=2
    const groups = selectedCombo._item_groups || [];
    if (groups.length === 0) {
      alert(t('combo_editor.validation.min_groups'));
      return;
    }
    const hasInvalidGroup = groups.some((grp: string[]) => grp.length < 2);
    if (hasInvalidGroup) {
      alert(t('combo_editor.validation.min_items'));
      return;
    }
    
    setIsSaving(true);
    try {
      const formattedCombos = groups.map((grp: string[]) => ({ Combo: grp }));
      const payload = {
        Combos: formattedCombos,
        Script: selectedCombo.Script
      };
      await axios.put(`${API_URL}/api/combos/${selectedCombo._index}`, { data: payload });
      alert(t('combo_editor.save_success'));
      setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _source: 'custom' } : c));
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao salvar combo:", err);
      alert(t('combo_editor.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewCombo = async () => {
    try {
      const newCombo = {
        Combos: [{ Combo: ['Novo_Item_1', 'Novo_Item_2'] }],
        Script: 'bonus bStr, 1;\n'
      };
      const res = await axios.post(`${API_URL}/api/combos/`, { data: newCombo });
      const created = res.data;
      created._source = 'custom';
      created._item_groups = [['Novo_Item_1', 'Novo_Item_2']];
      setCombos(prev => [created, ...prev]);
      setSelectedIndex(created._index);
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao criar combo:", err);
      alert(t('combo_editor.create_error'));
    }
  };

  // Live Preview Generator
  const livePreviewYaml = useMemo(() => {
    if (!selectedCombo) return "";
    const formattedCombos = (selectedCombo._item_groups || []).map((grp: string[]) => ({
      Combo: grp
    }));
    const previewObj = {
      Combos: formattedCombos,
      Script: selectedCombo.Script
    };
    try {
      return yaml.stringify(previewObj);
    } catch (e) {
      return t('combo_editor.live_preview.error');
    }
  }, [selectedCombo]);

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Layers size={18} className="text-cyan-500" /> {t('combo_editor.sidebar.title')}
            </h2>
            <button
              onClick={handleCreateNewCombo}
              className="p-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 rounded transition-colors"
              title={t('combo_editor.sidebar.new_combo')}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedIndex(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-cyan-600/80 text-white shadow-md shadow-cyan-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} /> rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaCombos.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedIndex(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} /> Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {customCombos.length.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={t('combo_editor.sidebar.search_placeholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">{loadingStatus}</div>
          ) : (
            <Virtuoso
              data={filteredCombos}
              style={{ height: '100%' }}
              itemContent={(index, combo) => {
                const isSelected = selectedIndex === combo._index;
                const isCustom = combo._source === 'custom';
                const itemsList = (combo._item_groups || []).flat();
                return (
                  <div
                    onClick={() => setSelectedIndex(combo._index)}
                    className={`p-3 cursor-pointer border-b border-white/5 transition-all duration-150 ${
                      isSelected
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-cyan-600/20 to-transparent border-l-2 border-l-cyan-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {itemsList.slice(0, 4).map((itm: string, i: number) => (
                        <span key={i} className="text-[10px] bg-dark-900 border border-dark-700 text-cyan-300 px-1.5 py-0.5 rounded">
                          {getItemDisplayName(itm)}
                        </span>
                      ))}
                      {itemsList.length > 4 && <span className="text-[10px] text-gray-500 font-mono">+{itemsList.length - 4}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 font-mono line-clamp-1 truncate">
                      {combo.Script || t('combo_editor.no_script')}
                    </p>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail View - Split Layout */}
      <div className="flex-1 bg-dark-950 flex flex-col h-full overflow-hidden">
        {selectedCombo ? (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center p-6 pb-4 border-b border-dark-800 bg-dark-950 flex-shrink-0">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>{t('combo_editor.detail.title')}</span>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-mono ${selectedCombo._source === 'custom' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-gray-400'}`}>
                    {selectedCombo._source === 'custom' ? t('combo_editor.source.custom') : t('combo_editor.source.rathena')}
                  </span>
                </h1>
                <span className="text-xs font-mono text-gray-500">
                  {t('combo_editor.detail.index', { index: selectedCombo._index })}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveCombo}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-cyan-900/30 transition-all disabled:opacity-50"
              >
                <Save size={16} />
                <span>{t('combo_editor.detail.save_button')}</span>
              </button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
               {/* Left Pane - Form */}
               <div className="flex-1 flex flex-col overflow-y-auto p-6 border-r border-dark-800 custom-scrollbar">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="text-sm font-semibold text-gray-300">{t('combo_editor.variants.title')}</h3>
                     <button onClick={handleAddVariant} className="flex items-center gap-1.5 text-xs bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 px-2.5 py-1 rounded transition-colors">
                        <Plus size={14} /> {t('combo_editor.variants.add_variant')}
                     </button>
                  </div>
                  <div className="space-y-4 mb-6">
                    {(selectedCombo._item_groups || []).map((grp: string[], varIdx: number) => {
                       const selectedOpts = grp.map(g => itemOptions.find(o => o.value.toLowerCase() === g.toLowerCase()) || { value: g, label: g });
                       const hasError = grp.length > 0 && grp.length < 2;
                       return (
                         <div key={varIdx} className={`p-4 rounded-xl border ${hasError ? 'border-red-500/30 bg-red-500/5' : 'border-dark-700 bg-dark-900/40'}`}>
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs font-bold text-cyan-400">{t('combo_editor.variants.variant_header', { index: varIdx + 1 })}</span>
                              <button onClick={() => handleRemoveVariant(varIdx)} className="text-gray-500 hover:text-red-400">
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <Select
                              isMulti
                              options={itemOptions}
                              value={selectedOpts}
                              onChange={(newVal) => handleUpdateVariant(varIdx, newVal.map(v => v.value))}
                              styles={selectStyles}
                              placeholder={t('combo_editor.variants.select_placeholder')}
                              className="text-sm"
                              noOptionsMessage={() => t('combo_editor.variants.no_options')}
                              menuPortalTarget={document.body}
                            />
                            {hasError && <p className="text-xs text-red-400 mt-2 flex items-center gap-1">{t('combo_editor.variants.min_items_error')}</p>}
                         </div>
                       )
                    })}
                  </div>
                  
                  <ScriptEditor
                    label={t('combo_editor.script.label')}
                    value={selectedCombo.Script || ''}
                    onChange={handleUpdateScript}
                    height="260px"
                  />
               </div>
               
               {/* Right Pane - Live Preview */}
               <div className="w-[450px] flex-shrink-0 bg-[#0a0a0f] flex flex-col">
                 <div className="px-4 py-3 border-b border-dark-800 bg-[#0d0d14] flex items-center gap-2">
                   <Code2 size={16} className="text-emerald-500" />
                   <span className="text-sm font-semibold text-gray-300">{t('combo_editor.live_preview.title')}</span>
                 </div>
                 <div className="flex-1 p-4 overflow-y-auto">
                   <pre className="text-sm font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
                     {livePreviewYaml}
                   </pre>
                 </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Layers size={64} className="mb-4 opacity-20 text-cyan-500" />
            <h3 className="text-xl font-medium text-gray-400">{t('combo_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2">{t('combo_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComboEditor;
