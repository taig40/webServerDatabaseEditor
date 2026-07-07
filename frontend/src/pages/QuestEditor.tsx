import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Compass, Plus, Database, Sparkles, Save, Trash2 } from 'lucide-react';
import { RepeatableGroup } from '../components/RepeatableGroup';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';
import { useLanguageStore } from '../store/useLanguageStore';

type SourceTab = 'rathena' | 'custom';

export const QuestEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [quests, setQuests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('quest_editor.status.loading'));
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedQuestId, setSelectedQuestId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerConfig, setPickerConfig] = useState<{ open: boolean; type: 'item' | 'mob'; targetType: 'target' | 'drop'; idx: number }>({ open: false, type: 'mob', targetType: 'target', idx: 0 });

  useEffect(() => {
    fetchQuests();
  }, []);

  const fetchQuests = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/quests/?limit=50000`);
      setQuests(res.data.quests || []);
      setIsLoading(false);
    } catch (err) {
      console.error("Erro ao carregar quests:", err);
      setLoadingStatus(t('quest_editor.status.error_fetching'));
      setIsLoading(false);
    }
  };

  const rathenaQuests = useMemo(() => quests.filter(q => q._source === 'rathena'), [quests]);
  const customQuests = useMemo(() => quests.filter(q => q._source === 'custom'), [quests]);

  const filteredQuests = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaQuests : customQuests;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(item => String(item.Id).includes(q) || String(item.Title || '').toLowerCase().includes(q));
  }, [rathenaQuests, customQuests, sourceTab, searchText]);

  const selectedQuest = useMemo(() => {
    return quests.find(q => q.Id === selectedQuestId) || null;
  }, [quests, selectedQuestId]);

  const handleUpdateField = (field: string, value: any) => {
    if (!selectedQuest) return;
    setQuests(prev => prev.map(q => q.Id === selectedQuest.Id ? { ...q, [field]: value } : q));
  };

  const handleAddTarget = () => {
    if (!selectedQuest) return;
    const targets = selectedQuest.Targets || [];
    const updated = [...targets, { Mob: 1002, Count: 10 }];
    handleUpdateField('Targets', updated);
  };

  const handleRemoveTarget = (idx: number) => {
    if (!selectedQuest) return;
    const updated = (selectedQuest.Targets || []).filter((_: any, i: number) => i !== idx);
    handleUpdateField('Targets', updated);
  };

  const handleUpdateTargetField = (idx: number, field: string, value: any) => {
    if (!selectedQuest) return;
    const updated = (selectedQuest.Targets || []).map((t: any, i: number) => i === idx ? { ...t, [field]: value } : t);
    handleUpdateField('Targets', updated);
  };

  const handleAddDrop = () => {
    if (!selectedQuest) return;
    const drops = selectedQuest.Drops || [];
    const updated = [...drops, { Mob: 1002, Item: 501, Rate: 10000 }];
    handleUpdateField('Drops', updated);
  };

  const handleRemoveDrop = (idx: number) => {
    if (!selectedQuest) return;
    const updated = (selectedQuest.Drops || []).filter((_: any, i: number) => i !== idx);
    handleUpdateField('Drops', updated);
  };

  const handleUpdateDropField = (idx: number, field: string, value: any) => {
    if (!selectedQuest) return;
    const updated = (selectedQuest.Drops || []).map((d: any, i: number) => i === idx ? { ...d, [field]: value } : d);
    handleUpdateField('Drops', updated);
  };

  const handleSaveQuest = async () => {
    if (!selectedQuest) return;
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/api/quests/${selectedQuest.Id}`, { data: selectedQuest });
      alert(t('quest_editor.save_success'));
      setQuests(prev => prev.map(q => q.Id === selectedQuest.Id ? { ...selectedQuest, _source: 'custom' } : q));
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao salvar quest:", err);
      alert(t('quest_editor.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewQuest = async () => {
    try {
      const newQuest = {
        Id: 99999,
        Title: t('quest_editor.create_default_title'),
        TimeLimit: 0,
        Targets: [{ Mob: 1002, Count: 5 }],
        Drops: []
      };
      const res = await axios.post(`${API_URL}/api/quests/`, { data: newQuest });
      const created = res.data;
      created._source = 'custom';
      setQuests(prev => [created, ...prev]);
      setSelectedQuestId(created.Id);
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao criar quest:", err);
      alert(t('quest_editor.create_error'));
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Compass size={18} className="text-indigo-500" /> {t('quest_editor.sidebar.title')}
            </h2>
            <button
              onClick={handleCreateNewQuest}
              className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded transition-colors"
              title={t('quest_editor.sidebar.add_quest')}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedQuestId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-indigo-600/80 text-white shadow-md shadow-indigo-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} /> rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaQuests.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedQuestId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} /> Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {customQuests.length.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={t('quest_editor.sidebar.search_placeholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">{loadingStatus}</div>
          ) : (
            <Virtuoso
              data={filteredQuests}
              style={{ height: '100%' }}
              itemContent={(index, quest) => {
                const isSelected = selectedQuestId === quest.Id;
                const isCustom = quest._source === 'custom';
                return (
                  <div
                    onClick={() => setSelectedQuestId(quest.Id)}
                    className={`p-3 cursor-pointer border-b border-white/5 transition-all duration-150 flex justify-between items-center ${
                      isSelected
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-indigo-600/20 to-transparent border-l-2 border-l-indigo-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <span className={`text-sm truncate font-medium ${isSelected ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {quest.Title || `${t('quest_editor.sidebar.title')} #${quest.Id}`}
                      </span>
                      <span className="text-[11px] text-gray-500 font-mono">ID: {quest.Id}</span>
                    </div>
                    <span className="text-[10px] bg-dark-900 text-indigo-300 font-mono px-1.5 py-0.5 rounded border border-white/5">
                      {t('quest_editor.sidebar.targets_count', { count: (quest.Targets || []).length })}
                    </span>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-y-auto p-6">
        {selectedQuest ? (
          <div className="max-w-4xl space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-dark-800">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>{selectedQuest.Title || `${t('quest_editor.sidebar.title')} #${selectedQuest.Id}`}</span>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-mono ${selectedQuest._source === 'custom' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-gray-400'}`}>
                    {selectedQuest._source === 'custom' ? t('quest_editor.source.custom') : t('quest_editor.source.rathena')}
                  </span>
                </h1>
                <span className="text-xs font-mono text-gray-500">{t('quest_editor.detail.quest_id_line', { id: selectedQuest.Id })}</span>
              </div>
              <button
                type="button"
                onClick={handleSaveQuest}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-indigo-900/30 transition-all disabled:opacity-50"
              >
                <Save size={16} />
                <span>{t('quest_editor.detail.save_button')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">{t('quest_editor.fields.quest_id')}</label>
                <input
                  type="number"
                  value={selectedQuest.Id || 0}
                  onChange={(e) => handleUpdateField('Id', parseInt(e.target.value) || 0)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm font-mono text-white"
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs font-medium text-gray-400">{t('quest_editor.fields.title')}</label>
                <input
                  type="text"
                  value={selectedQuest.Title || ''}
                  onChange={(e) => handleUpdateField('Title', e.target.value)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">{t('quest_editor.fields.time_limit')}</label>
                <input
                  type="number"
                  value={selectedQuest.TimeLimit || 0}
                  onChange={(e) => handleUpdateField('TimeLimit', parseInt(e.target.value) || 0)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                />
              </div>
            </div>

            {/* Targets */}
            <RepeatableGroup
              title={t('quest_editor.targets.title')}
              items={selectedQuest.Targets || []}
              onAdd={handleAddTarget}
              onRemove={handleRemoveTarget}
              renderItem={(target: any, idx: number) => (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-400 flex justify-between">
                      <span>{t('quest_editor.targets.mob_id')}</span>
                      <button
                        type="button"
                        onClick={() => setPickerConfig({ open: true, type: 'mob', targetType: 'target', idx })}
                        className="text-[10px] text-indigo-400 hover:underline"
                      >
                        {t('quest_editor.targets.search_mob')}
                      </button>
                    </label>
                    <input
                      type="number"
                      value={target.Mob || 0}
                      onChange={(e) => handleUpdateTargetField(idx, 'Mob', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-2.5 py-1 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-400">{t('quest_editor.targets.count')}</label>
                    <input
                      type="number"
                      value={target.Count || 1}
                      onChange={(e) => handleUpdateTargetField(idx, 'Count', parseInt(e.target.value) || 1)}
                      className="bg-dark-900 border border-dark-700 rounded px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-400">{t('quest_editor.targets.race')}</label>
                    <input
                      type="text"
                      value={target.Race || ''}
                      onChange={(e) => handleUpdateTargetField(idx, 'Race', e.target.value)}
                      placeholder={t('quest_editor.targets.race_placeholder')}
                      className="bg-dark-900 border border-dark-700 rounded px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            />

            {/* Drops */}
            <RepeatableGroup
              title={t('quest_editor.drops.title')}
              items={selectedQuest.Drops || []}
              onAdd={handleAddDrop}
              onRemove={handleRemoveDrop}
              renderItem={(drop: any, idx: number) => (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-400 flex justify-between">
                      <span>{t('quest_editor.drops.mob_id')}</span>
                      <button
                        type="button"
                        onClick={() => setPickerConfig({ open: true, type: 'mob', targetType: 'drop', idx })}
                        className="text-[10px] text-indigo-400 hover:underline"
                      >
                        {t('quest_editor.drops.search_mob')}
                      </button>
                    </label>
                    <input
                      type="number"
                      value={drop.Mob || 0}
                      onChange={(e) => handleUpdateDropField(idx, 'Mob', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-2.5 py-1 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-400 flex justify-between">
                      <span>{t('quest_editor.drops.item_id')}</span>
                      <button
                        type="button"
                        onClick={() => setPickerConfig({ open: true, type: 'item', targetType: 'drop', idx })}
                        className="text-[10px] text-indigo-400 hover:underline"
                      >
                        {t('quest_editor.drops.search_item')}
                      </button>
                    </label>
                    <input
                      type="number"
                      value={drop.Item || 0}
                      onChange={(e) => handleUpdateDropField(idx, 'Item', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-2.5 py-1 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <PercentBadge
                      label={t('quest_editor.drops.rate')}
                      value={drop.Rate || 10000}
                      onChange={(val) => handleUpdateDropField(idx, 'Rate', val)}
                      scale={100}
                    />
                  </div>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Compass size={64} className="mb-4 opacity-20 text-indigo-500" />
            <h3 className="text-xl font-medium text-gray-400">{t('quest_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2">{t('quest_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerConfig.open}
        onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
        type={pickerConfig.type}
        onSelect={(id, name) => {
          if (pickerConfig.targetType === 'target') {
            handleUpdateTargetField(pickerConfig.idx, 'Mob', Number(id));
          } else {
            if (pickerConfig.type === 'mob') {
              handleUpdateDropField(pickerConfig.idx, 'Mob', Number(id));
            } else {
              handleUpdateDropField(pickerConfig.idx, 'Item', Number(id));
            }
          }
        }}
      />
    </div>
  );
};

export default QuestEditor;
