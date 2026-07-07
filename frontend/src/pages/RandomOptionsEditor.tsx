import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { Search, Plus, Trash2, Save, Sparkles, Loader2 } from 'lucide-react';

interface OptionDefinition {
  Id: number;
  Option: string;
}

interface OptionLine {
  Option: string;
  Chance: number;
}

interface RandomOptionGroup {
  Id: number;
  Group: string;
  Options: OptionLine[];
}

export const RandomOptionsEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  
  const [options, setOptions] = useState<OptionDefinition[]>([]);
  const [groups, setGroups] = useState<RandomOptionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/server/randomopt`);
      setOptions(res.data.options || []);
      setGroups(res.data.groups || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching random options:', err);
      setIsLoading(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!searchText.trim()) return groups;
    const q = searchText.toLowerCase();
    return groups.filter(
      g =>
        String(g.Id).includes(q) ||
        (g.Group && g.Group.toLowerCase().includes(q))
    );
  }, [groups, searchText]);

  const selectedGroup = useMemo(() => {
    return groups.find(g => g.Id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  const handleUpdateGroupField = (field: keyof RandomOptionGroup, value: any) => {
    if (selectedGroupId === null) return;
    setGroups(prev =>
      prev.map(g => (g.Id === selectedGroupId ? { ...g, [field]: value } : g))
    );
  };

  const handleAddLine = () => {
    if (!selectedGroup) return;
    const defaultOpt = options[0]?.Option || '';
    const updated = [...selectedGroup.Options, { Option: defaultOpt, Chance: 1000 }];
    handleUpdateGroupField('Options', updated);
  };

  const handleRemoveLine = (idx: number) => {
    if (!selectedGroup) return;
    const updated = selectedGroup.Options.filter((_, i) => i !== idx);
    handleUpdateGroupField('Options', updated);
  };

  const handleUpdateLineField = (idx: number, field: keyof OptionLine, value: any) => {
    if (!selectedGroup) return;
    const updated = selectedGroup.Options.map((line, i) =>
      i === idx ? { ...line, [field]: value } : line
    );
    handleUpdateGroupField('Options', updated);
  };

  const handleCreateGroup = () => {
    const nextId = groups.length > 0 ? Math.max(...groups.map(g => g.Id)) + 1 : 1;
    const newGroup: RandomOptionGroup = {
      Id: nextId,
      Group: `Group_${nextId}`,
      Options: []
    };
    setGroups(prev => [...prev, newGroup]);
    setSelectedGroupId(nextId);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      await axios.put(`${API_URL}/api/server/randomopt`, {
        groups: groups
      });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving groups:', err);
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-gray-500 bg-[#0f0f14]">
        <Loader2 size={20} className="animate-spin text-cyan-400" />
        <span className="text-sm font-medium">{t('common.loading') || 'Carregando...'}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#0f0f14] text-gray-200 overflow-hidden font-sans">
      
      {/* ── Left Sidebar: Group List ────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-white/5 bg-[#12121a] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/5 bg-gradient-to-r from-violet-950/20 to-transparent">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-cyan-400" />
              {t('components.random_options_editor.title') || 'Opções Aleatórias'}
            </h2>
            <button
              onClick={handleCreateGroup}
              title={t('components.random_options_editor.new_group') || 'Novo Grupo'}
              className="p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md shadow-cyan-950/40"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={t('components.random_options_editor.search_placeholder') || 'Buscar grupos...'}
              className="w-full bg-[#09090f] border border-white/5 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredGroups.map(g => {
            const isSelected = g.Id === selectedGroupId;
            return (
              <button
                key={g.Id}
                onClick={() => setSelectedGroupId(g.Id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-600/30 to-indigo-600/10 text-white border border-cyan-500/30 font-medium'
                    : 'text-gray-400 hover:bg-[#181824] hover:text-gray-200 border border-transparent'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-[10px] text-cyan-400">ID: {g.Id}</span>
                  <span className="font-semibold truncate">{g.Group}</span>
                </div>
                <span className="text-[10px] bg-dark-900 px-2 py-0.5 rounded-md border border-white/5 text-gray-500">
                  {g.Options.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right Content Panel: Detail & Forms ──────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col bg-[#0f0f14]">
        
        {selectedGroup ? (
          <div className="p-8 max-w-4xl w-full mx-auto space-y-6">
            
            {/* Header / Top Card */}
            <div className="bg-[#13131f] rounded-2xl border border-white/5 p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                    {t('components.random_options_editor.group_id') || 'ID do Grupo'}: {selectedGroup.Id}
                  </span>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    {selectedGroup.Group}
                  </h1>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    {t('components.random_options_editor.save_btn') || 'Salvar Alterações'}
                  </button>
                  {saveSuccess && (
                    <span className="text-xs text-green-400 font-medium animate-pulse">
                      {t('components.random_options_editor.saved_toast') || '✓ Salvo!'}
                    </span>
                  )}
                </div>
              </div>

              {/* Group Name Editing */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                    {t('components.random_options_editor.group_name') || 'Constante do Grupo'}
                  </label>
                  <input
                    type="text"
                    value={selectedGroup.Group}
                    onChange={e => handleUpdateGroupField('Group', e.target.value)}
                    className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/60 transition-colors font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Options Lines Card */}
            <div className="bg-[#13131f] rounded-2xl border border-white/5 p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-semibold text-white">
                  {t('components.random_options_editor.options_list') || 'Lista de Bônus / Opções'}
                </h3>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-900/40 text-cyan-300 transition-all font-medium cursor-pointer"
                >
                  <Plus size={12} />
                  {t('components.random_options_editor.add_option') || 'Adicionar Bônus'}
                </button>
              </div>

              <div className="space-y-3">
                {selectedGroup.Options.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 text-xs">
                    {t('components.random_options_editor.no_options') || 'Nenhum bônus adicionado a este grupo ainda.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-gray-500 font-bold border-b border-white/5">
                          <th className="pb-2 w-2/3">{t('components.random_options_editor.option_header') || 'Opção'}</th>
                          <th className="pb-2 w-1/4">{t('components.random_options_editor.chance_header') || 'Chance'}</th>
                          <th className="pb-2 text-right w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGroup.Options.map((line, idx) => {
                          const percentage = ((line.Chance || 0) / 100).toFixed(2);
                          return (
                            <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/[0.01] transition-colors">
                              <td className="py-2.5 pr-4">
                                <select
                                  value={line.Option}
                                  onChange={e => handleUpdateLineField(idx, 'Option', e.target.value)}
                                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/60 transition-colors font-mono cursor-pointer"
                                >
                                  {options.map(opt => (
                                    <option key={opt.Id} value={opt.Option}>
                                      {opt.Option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2.5 pr-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={10000}
                                    value={line.Chance}
                                    onChange={e => handleUpdateLineField(idx, 'Chance', parseInt(e.target.value) || 0)}
                                    className="w-24 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/60 transition-colors font-mono"
                                  />
                                  <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                                    {percentage}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3 p-8">
            <Sparkles size={48} className="text-gray-800" />
            <h3 className="text-sm font-semibold text-gray-400">
              {t('components.random_options_editor.select_group') || 'Selecione um Grupo de Opções'}
            </h3>
            <p className="text-xs text-gray-600 text-center max-w-xs">
              {t('components.random_options_editor.select_group_desc') || 'Escolha um grupo na lista da esquerda ou clique no botão + para criar um novo.'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default RandomOptionsEditor;
