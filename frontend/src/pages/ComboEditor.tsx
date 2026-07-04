import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Layers, Plus, Database, Sparkles, Save, Trash2, Package } from 'lucide-react';
import { ScriptEditor } from '../components/ScriptEditor';
import { RepeatableGroup } from '../components/RepeatableGroup';
import { ReferencePicker } from '../components/ReferencePicker';

type SourceTab = 'rathena' | 'custom';

export const ComboEditor: React.FC = () => {
  const [combos, setCombos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Carregando banco de combos...");
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeVariantIdx, setActiveVariantIdx] = useState<number | null>(null);

  useEffect(() => {
    fetchCombos();
  }, []);

  const fetchCombos = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/combos/?limit=50000`);
      setCombos(res.data.combos || []);
      setIsLoading(false);
    } catch (err) {
      console.error("Erro ao carregar combos:", err);
      setLoadingStatus("Erro ao carregar combos.");
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
      const itemNames = (c._item_groups || []).flat().join(' ').toLowerCase();
      const script = String(c.Script || '').toLowerCase();
      return itemNames.includes(q) || script.includes(q);
    });
  }, [rathenaCombos, customCombos, sourceTab, searchText]);

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
    const updated = [...currentGroups, ['Item_Exemplo_1', 'Item_Exemplo_2']];
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: updated } : c));
  };

  const handleRemoveVariant = (idx: number) => {
    if (!selectedCombo) return;
    const currentGroups = selectedCombo._item_groups || [];
    const updated = currentGroups.filter((_, i) => i !== idx);
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: updated } : c));
  };

  const handleRemoveItemFromVariant = (varIdx: number, itemIdx: number) => {
    if (!selectedCombo) return;
    const currentGroups = (selectedCombo._item_groups || []).map((grp: string[], i: number) => {
      if (i === varIdx) {
        return grp.filter((_, j) => j !== itemIdx);
      }
      return grp;
    });
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: currentGroups } : c));
  };

  const handleAddItemToVariant = (varIdx: number, itemName: string) => {
    if (!selectedCombo) return;
    const currentGroups = (selectedCombo._item_groups || []).map((grp: string[], i: number) => {
      if (i === varIdx) {
        return [...grp, itemName];
      }
      return grp;
    });
    setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _item_groups: currentGroups } : c));
  };

  const handleSaveCombo = async () => {
    if (!selectedCombo) return;
    setIsSaving(true);
    try {
      // Build raw Combos structure expected by YAML
      const formattedCombos = (selectedCombo._item_groups || []).map((grp: string[]) => ({
        Combo: grp
      }));
      const payload = {
        Combos: formattedCombos,
        Script: selectedCombo.Script
      };
      const res = await axios.put(`${API_URL}/api/combos/${selectedCombo._index}`, {
        data: payload
      });
      alert("Combo de itens salvo com sucesso em db/import/item_combos.yml!");
      setCombos(prev => prev.map(c => c._index === selectedCombo._index ? { ...c, _source: 'custom' } : c));
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao salvar combo:", err);
      alert("Erro ao salvar combo.");
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
      alert("Erro ao criar novo combo.");
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Layers size={18} className="text-cyan-500" /> Combos de Itens
            </h2>
            <button
              onClick={handleCreateNewCombo}
              className="p-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 rounded transition-colors"
              title="Novo Combo"
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
              placeholder="Buscar por item ou script..."
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
                        <span key={i} className="text-[10px] bg-dark-900 border border-dark-700 font-mono text-cyan-300 px-1.5 py-0.5 rounded">
                          {itm}
                        </span>
                      ))}
                      {itemsList.length > 4 && <span className="text-[10px] text-gray-500 font-mono">+{itemsList.length - 4}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 font-mono line-clamp-1 truncate">
                      {combo.Script || 'Sem script'}
                    </p>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-y-auto p-6">
        {selectedCombo ? (
          <div className="max-w-4xl space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-dark-800">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Combo de Itens</span>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-mono ${selectedCombo._source === 'custom' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-gray-400'}`}>
                    {selectedCombo._source === 'custom' ? 'Custom Import' : 'rAthena Original'}
                  </span>
                </h1>
                <span className="text-xs font-mono text-gray-500">
                  Índice Posicional: {selectedCombo._index}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveCombo}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-cyan-900/30 transition-all disabled:opacity-50"
              >
                <Save size={16} />
                <span>Salvar em db/import/item_combos.yml</span>
              </button>
            </div>

            {/* Variants Editor */}
            <RepeatableGroup
              title="Variantes de Combinações de Itens"
              items={selectedCombo._item_groups || []}
              onAdd={handleAddVariant}
              onRemove={handleRemoveVariant}
              renderItem={(variant: string[], varIdx: number) => (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-cyan-400">Variante #{varIdx + 1} (mínimo 2 itens)</span>
                    <button
                      type="button"
                      onClick={() => { setActiveVariantIdx(varIdx); setPickerOpen(true); }}
                      className="text-xs bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
                    >
                      <Plus size={14} /> Adicionar Item ao Combo
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {variant.map((itemName: string, itemIdx: number) => (
                      <div key={itemIdx} className="flex items-center gap-1.5 bg-dark-900 border border-dark-700 px-2.5 py-1 rounded-lg">
                        <Package size={14} className="text-cyan-400" />
                        <span className="text-xs font-mono text-gray-200">{itemName}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItemFromVariant(varIdx, itemIdx)}
                          className="text-gray-500 hover:text-red-400 ml-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />

            {/* Script Editor */}
            <ScriptEditor
              label="Bônus do Combo (Script)"
              value={selectedCombo.Script || ''}
              onChange={handleUpdateScript}
              height="260px"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Layers size={64} className="mb-4 opacity-20 text-cyan-500" />
            <h3 className="text-xl font-medium text-gray-400">Nenhum Combo Selecionado</h3>
            <p className="text-sm mt-2">Selecione uma combinação de itens na lista ao lado para editar.</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        type="item"
        onSelect={(id, name) => {
          if (activeVariantIdx !== null) {
            handleAddItemToVariant(activeVariantIdx, name);
          }
        }}
      />
    </div>
  );
};

export default ComboEditor;
