import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Compass, Plus, Database, Sparkles, Save, Trash2, ShieldAlert, CheckCircle2, AlertTriangle, Scroll } from 'lucide-react';
import { RepeatableGroup } from '../components/RepeatableGroup';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';
import { useLanguageStore } from '../store/useLanguageStore';
import { translateApiError } from '../utils/errors';
import { toast } from '../store/useToastStore';

type SourceTab = 'rathena' | 'custom';

interface ClientQuestData {
  Title: string;
  Summary: string;
  Info: string;
  QuickInfo: string[];
}

interface ServerQuestData {
  Id: number;
  Title: string;
  TimeLimit?: number;
  Targets?: { Mob: number | string; Count: number; Race?: string; Size?: string; Element?: string; MinLevel?: number; MaxLevel?: number; Location?: string; MapName?: string }[];
  Drops?: { Mob: number | string; Item: number | string; Count?: number; Rate: number }[];
  _source?: 'rathena' | 'custom';
}

interface UnifiedQuest {
  Id: number;
  server: ServerQuestData | null;
  client: ClientQuestData | null;
  status: 'ok' | 'divergent' | 'server_only' | 'client_only';
}

export const QuestEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [quests, setQuests] = useState<UnifiedQuest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('quest_editor.status.loading'));
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedQuestId, setSelectedQuestId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'server' | 'client'>('server');
  const [isSaving, setIsSaving] = useState(false);

  // Modal creation states
  const [showNewModal, setShowNewModal] = useState(false);
  const [newId, setNewId] = useState(90000);
  const [newTitle, setNewTitle] = useState('Nova Quest');

  // Picker config
  const [pickerConfig, setPickerConfig] = useState<{ open: boolean; type: 'item' | 'mob'; targetType: 'target' | 'drop'; idx: number }>({
    open: false,
    type: 'mob',
    targetType: 'target',
    idx: 0
  });

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

  const rathenaQuests = useMemo(() => {
    return quests.filter(q => q.server?._source === 'rathena' || (!q.server && q.client));
  }, [quests]);

  const customQuests = useMemo(() => {
    return quests.filter(q => q.server?._source === 'custom');
  }, [quests]);

  const filteredQuests = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaQuests : customQuests;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(item => {
      const idStr = String(item.Id);
      const sTitle = (item.server?.Title || '').toLowerCase();
      const cTitle = (item.client?.Title || '').toLowerCase();
      const cSummary = (item.client?.Summary || '').toLowerCase();
      const cInfo = (item.client?.Info || '').toLowerCase();
      return idStr.includes(q) || sTitle.includes(q) || cTitle.includes(q) || cSummary.includes(q) || cInfo.includes(q);
    });
  }, [rathenaQuests, customQuests, sourceTab, searchText]);

  const selectedQuest = useMemo(() => {
    return quests.find(q => q.Id === selectedQuestId) || null;
  }, [quests, selectedQuestId]);

  // Field update helpers
  const updateServerField = (field: string, val: any) => {
    if (!selectedQuestId) return;
    setQuests(prev => prev.map(q => {
      if (q.Id !== selectedQuestId) return q;
      const s = { ...(q.server || { Id: selectedQuestId, Title: '', TimeLimit: 0, Targets: [], Drops: [] }), [field]: val };
      return { ...q, server: s };
    }));
  };

  const updateClientField = (field: string, val: any) => {
    if (!selectedQuestId) return;
    setQuests(prev => prev.map(q => {
      if (q.Id !== selectedQuestId) return q;
      const c = { ...(q.client || { Title: '', Summary: '', Info: '', QuickInfo: [] }), [field]: val };
      
      // UX Auto-fill: Sync client Title changes to Server Title automatically
      const s = q.server ? { ...q.server } : { Id: selectedQuestId, Title: '', TimeLimit: 0, Targets: [], Drops: [] };
      if (field === 'Title') {
        s.Title = val;
      }
      
      return { ...q, client: c, server: s };
    }));
  };

  // Helper to sync server title to client or vice versa
  const handleAutoGenerateClient = () => {
    if (!selectedQuest || !selectedQuest.server) return;
    const s = selectedQuest.server;
    const newClient: ClientQuestData = {
      Title: s.Title || 'Nova Quest',
      Summary: s.Title || 'Nova Quest',
      Info: 'Completar objetivos definidos na missão.',
      QuickInfo: s.Targets?.map((t: any) => `Derrotar ${t.Mob} (x${t.Count})`) || ['Completar o objetivo.']
    };
    updateClientField('Title', newClient.Title);
    updateClientField('Summary', newClient.Summary);
    updateClientField('Info', newClient.Info);
    updateClientField('QuickInfo', newClient.QuickInfo);
  };

  // Targets (Server)
  const handleAddTarget = () => {
    if (!selectedQuest) return;
    const s = selectedQuest.server || { Id: selectedQuestId!, Title: '', TimeLimit: 0, Targets: [], Drops: [] };
    const targets = s.Targets || [];
    const updated = [...targets, { Mob: 1002, Count: 10 }];
    updateServerField('Targets', updated);
  };

  const handleRemoveTarget = (idx: number) => {
    if (!selectedQuest || !selectedQuest.server) return;
    const updated = (selectedQuest.server.Targets || []).filter((_: any, i: number) => i !== idx);
    updateServerField('Targets', updated);
  };

  const handleUpdateTargetField = (idx: number, field: string, value: any) => {
    if (!selectedQuest || !selectedQuest.server) return;
    const updated = (selectedQuest.server.Targets || []).map((t: any, i: number) => i === idx ? { ...t, [field]: value } : t);
    updateServerField('Targets', updated);
  };

  // Drops (Server)
  const handleAddDrop = () => {
    if (!selectedQuest) return;
    const s = selectedQuest.server || { Id: selectedQuestId!, Title: '', TimeLimit: 0, Targets: [], Drops: [] };
    const drops = s.Drops || [];
    const updated = [...drops, { Mob: 1002, Item: 501, Rate: 10000 }];
    updateServerField('Drops', updated);
  };

  const handleRemoveDrop = (idx: number) => {
    if (!selectedQuest || !selectedQuest.server) return;
    const updated = (selectedQuest.server.Drops || []).filter((_: any, i: number) => i !== idx);
    updateServerField('Drops', updated);
  };

  const handleUpdateDropField = (idx: number, field: string, value: any) => {
    if (!selectedQuest || !selectedQuest.server) return;
    const updated = (selectedQuest.server.Drops || []).map((d: any, i: number) => i === idx ? { ...d, [field]: value } : d);
    updateServerField('Drops', updated);
  };

  // Save changes
  const handleSaveQuest = async () => {
    if (!selectedQuest) return;
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/api/quests/${selectedQuest.Id}`, {
        server_data: selectedQuest.server,
        client_data: selectedQuest.client
      });
      toast.success(t('quest_editor.save_success'));
      await fetchQuests();
    } catch (err: any) {
      console.error("Erro ao salvar quest:", err);
      const errMsg = translateApiError(err?.response?.data?.detail, t) || err.message;
      toast.error(t('quest_editor.save_error') + ': ' + errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Create new quest
  const handleCreateQuest = async () => {
    if (!newId || !newTitle.trim()) {
      toast.error(t('achievement_editor.create_fill_fields'));
      return;
    }

    if (quests.some(q => q.Id === newId)) {
      toast.error(t('api_errors.ERROR_DUPLICATE_ID'));
      return;
    }

    try {
      const server = {
        Id: newId,
        Title: newTitle,
        TimeLimit: 0,
        Targets: [],
        Drops: []
      };

      const client = {
        Title: newTitle,
        Summary: newTitle,
        Info: 'Descrição básica da missão.',
        QuickInfo: ['Completar objetivo.']
      };

      await axios.post(`${API_URL}/api/quests/${newId}`, {
        server_data: server,
        client_data: client
      });

      toast.success(t('quest_editor_extra.alert_save_success'));
      setShowNewModal(false);
      await fetchQuests();
      setSelectedQuestId(newId);
      setSourceTab('custom');
    } catch (err: any) {
      console.error("Erro ao criar quest:", err);
      const errMsg = translateApiError(err?.response?.data?.detail, t) || err.message;
      toast.error(t('quest_editor_extra.alert_create_error', { error: errMsg }));
    }
  };

  // Get status badge UI
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle2 size={10} /> {t('quest_editor.badges.ok')}</span>;
      case 'divergent':
        return <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={10} /> {t('quest_editor.badges.divergent')}</span>;
      case 'server_only':
        return <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-wider flex items-center gap-1"><Database size={10} /> {t('quest_editor.badges.server_only')}</span>;
      case 'client_only':
        return <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 font-bold uppercase tracking-wider flex items-center gap-1"><Scroll size={10} /> {t('quest_editor.badges.client_only')}</span>;
      default:
        return null;
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
              onClick={() => setShowNewModal(true)}
              className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg border border-indigo-500/20 transition-all cursor-pointer"
              title={t('quest_editor.sidebar.add_quest')}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedQuestId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
                sourceTab === 'rathena'
                  ? 'bg-indigo-600/80 text-white shadow-md shadow-indigo-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} /> Original
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaQuests.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedQuestId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
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
              itemContent={(_index, quest) => {
                const isSelected = selectedQuestId === quest.Id;
                const isCustom = quest.server?._source === 'custom';
                const title = quest.client?.Title || quest.server?.Title || `${t('quest_editor.sidebar.title')} #${quest.Id}`;
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
                        {title}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500 font-mono">ID: {quest.Id}</span>
                        {getStatusBadge(quest.status)}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail Panel */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-hidden">
        {selectedQuest ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Header section */}
            <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-dark-800 bg-gradient-to-r from-indigo-600/10 to-transparent">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
                  <span>{selectedQuest.client?.Title || selectedQuest.server?.Title || `${t('quest_editor.sidebar.title')} #${selectedQuest.Id}`}</span>
                  {getStatusBadge(selectedQuest.status)}
                </h1>
                <div className="flex items-center gap-3 mt-1 text-xs font-mono text-gray-500">
                  <span>ID: <span className="text-indigo-400">{selectedQuest.Id}</span></span>
                  <span>Servidor: <span className="text-gray-400">{selectedQuest.server?._source || 'Não definido'}</span></span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Auto generate Client Lua helper */}
                {selectedQuest.status === 'server_only' && (
                  <button
                    onClick={handleAutoGenerateClient}
                    className="flex items-center gap-1.5 px-4 py-2 border border-indigo-500/20 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    <Sparkles size={13} /> Gerar LUA do Cliente
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveQuest}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold px-5 py-2 rounded-xl shadow-lg shadow-indigo-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save size={16} />
                  <span>{isSaving ? t('common.saving') : t('common.save')}</span>
                </button>
              </div>
            </div>

            {/* Tab selector */}
            <div className="flex-shrink-0 px-6 border-b border-white/5 bg-[#12121a] flex gap-6">
              <button
                onClick={() => setActiveTab('server')}
                className={`py-3 text-xs font-bold transition-all relative cursor-pointer focus:outline-none ${
                  activeTab === 'server' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t('quest_editor_extra.tab_server')} (YAML)
                {activeTab === 'server' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('client')}
                className={`py-3 text-xs font-bold transition-all relative cursor-pointer focus:outline-none ${
                  activeTab === 'client' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t('quest_editor_extra.tab_client')} (LUA)
                {activeTab === 'client' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                )}
              </button>
            </div>

            {/* Tab contents */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {activeTab === 'server' ? (
                <div className="max-w-4xl space-y-6">
                  {/* Server Logic Fields */}
                  <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-4">
                    <h3 className="text-white font-bold text-sm flex items-center gap-2 pb-3 border-b border-white/5">
                      <Database size={14} className="text-indigo-400" />
                      {t('quest_editor_extra.tab_server')}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor.fields.quest_id')}</label>
                        <input
                          type="number"
                          value={selectedQuest.server?.Id || selectedQuest.Id}
                          disabled
                          className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-500 font-mono cursor-not-allowed"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor.fields.time_limit')}</label>
                        <input
                          type="number"
                          value={selectedQuest.server?.TimeLimit || 0}
                          onChange={(e) => updateServerField('TimeLimit', parseInt(e.target.value) || 0)}
                          className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Targets Repeatable */}
                  <RepeatableGroup
                    title={t('quest_editor.targets.title')}
                    items={selectedQuest.server?.Targets || []}
                    onAdd={handleAddTarget}
                    onRemove={handleRemoveTarget}
                    renderItem={(target: any, idx: number) => (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 font-bold flex justify-between">
                            <span>{t('quest_editor.targets.mob_id')}</span>
                            <button
                              type="button"
                              onClick={() => setPickerConfig({ open: true, type: 'mob', targetType: 'target', idx })}
                              className="text-[9px] text-indigo-400 hover:underline cursor-pointer"
                            >
                              {t('quest_editor.targets.search_mob')}
                            </button>
                          </label>
                          <input
                            type="text"
                            value={target.Mob || 0}
                            onChange={(e) => handleUpdateTargetField(idx, 'Mob', e.target.value)}
                            className="bg-[#0f0f14] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 font-bold">{t('quest_editor.targets.count')}</label>
                          <input
                            type="number"
                            value={target.Count || 1}
                            onChange={(e) => handleUpdateTargetField(idx, 'Count', parseInt(e.target.value) || 1)}
                            className="bg-[#0f0f14] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 font-bold">{t('quest_editor.targets.race')}</label>
                          <input
                            type="text"
                            value={target.Race || ''}
                            onChange={(e) => handleUpdateTargetField(idx, 'Race', e.target.value)}
                            placeholder={t('quest_editor.targets.race_placeholder')}
                            className="bg-[#0f0f14] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  />

                  {/* Drops Repeatable */}
                  <RepeatableGroup
                    title={t('quest_editor.drops.title')}
                    items={selectedQuest.server?.Drops || []}
                    onAdd={handleAddDrop}
                    onRemove={handleRemoveDrop}
                    renderItem={(drop: any, idx: number) => (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 font-bold flex justify-between">
                            <span>{t('quest_editor.drops.mob_id')}</span>
                            <button
                              type="button"
                              onClick={() => setPickerConfig({ open: true, type: 'mob', targetType: 'drop', idx })}
                              className="text-[9px] text-indigo-400 hover:underline cursor-pointer"
                            >
                              {t('quest_editor.drops.search_mob')}
                            </button>
                          </label>
                          <input
                            type="text"
                            value={drop.Mob || 0}
                            onChange={(e) => handleUpdateDropField(idx, 'Mob', e.target.value)}
                            className="bg-[#0f0f14] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-400 font-bold flex justify-between">
                            <span>{t('quest_editor.drops.item_id')}</span>
                            <button
                              type="button"
                              onClick={() => setPickerConfig({ open: true, type: 'item', targetType: 'drop', idx })}
                              className="text-[9px] text-indigo-400 hover:underline cursor-pointer"
                            >
                              {t('quest_editor.drops.search_item')}
                            </button>
                          </label>
                          <input
                            type="text"
                            value={drop.Item || 0}
                            onChange={(e) => handleUpdateDropField(idx, 'Item', e.target.value)}
                            className="bg-[#0f0f14] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
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
                <div className="max-w-4xl space-y-6">
                  {/* Client texts */}
                  <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-4">
                    <h3 className="text-white font-bold text-sm flex items-center gap-2 pb-3 border-b border-white/5">
                      <Scroll size={14} className="text-cyan-400" />
                      {t('quest_editor_extra.title_client_texts')}
                    </h3>

                    {/* Display Title */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor_extra.label_quest_title')}</label>
                      <input
                        type="text"
                        value={selectedQuest.client?.Title || ''}
                        onChange={(e) => updateClientField('Title', e.target.value)}
                        placeholder={t('quest_editor_extra.placeholder_quest_title')}
                        className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/60"
                      />
                    </div>

                    {/* Summary */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor_extra.label_quest_summary')}</label>
                      <input
                        type="text"
                        value={selectedQuest.client?.Summary || ''}
                        onChange={(e) => updateClientField('Summary', e.target.value)}
                        placeholder={t('quest_editor_extra.placeholder_quest_summary')}
                        className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/60"
                      />
                    </div>

                    {/* Info/Description */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor_extra.label_quest_info')}</label>
                      <textarea
                        rows={5}
                        value={selectedQuest.client?.Info || ''}
                        onChange={(e) => updateClientField('Info', e.target.value)}
                        placeholder={t('quest_editor_extra.placeholder_quest_info')}
                        className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/60 resize-y font-mono leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Hunt checklist (QuickInfo) */}
                  <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-white/5">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <Scroll size={14} className="text-indigo-400" />
                        {t('quest_editor_extra.quick_info_title')}
                      </h3>
                      <button
                        onClick={() => {
                          const current = selectedQuest.client?.QuickInfo || [];
                          updateClientField('QuickInfo', [...current, t('quest_editor_extra.new_objective')]);
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                      >
                        {t('quest_editor_extra.add_line')}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(selectedQuest.client?.QuickInfo || []).map((objective, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-gray-500">#{idx + 1}</span>
                          <input
                            type="text"
                            value={objective}
                            onChange={(e) => {
                              const qinfo = [...(selectedQuest.client?.QuickInfo || [])];
                              qinfo[idx] = e.target.value;
                              updateClientField('QuickInfo', qinfo);
                            }}
                            className="flex-1 bg-[#0f0f14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500/60"
                          />
                          <button
                            onClick={() => {
                              const qinfo = (selectedQuest.client?.QuickInfo || []).filter((_, i) => i !== idx);
                              updateClientField('QuickInfo', qinfo);
                            }}
                            className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      {(selectedQuest.client?.QuickInfo || []).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-2">{t('constants_editor.no_constants')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Compass size={64} className="mb-4 opacity-20 text-indigo-500" />
            <h3 className="text-xl font-medium text-gray-400">{t('quest_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2">{t('quest_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

      {/* Reference Picker */}
      <ReferencePicker
        isOpen={pickerConfig.open}
        onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
        type={pickerConfig.type}
        onSelect={(id, name) => {
          if (pickerConfig.targetType === 'target') {
            handleUpdateTargetField(pickerConfig.idx, 'Mob', name); // AegisName
          } else {
            if (pickerConfig.type === 'mob') {
              handleUpdateDropField(pickerConfig.idx, 'Mob', name); // AegisName
            } else {
              handleUpdateDropField(pickerConfig.idx, 'Item', name); // AegisName
            }
          }
        }}
      />

      {/* New Quest Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-[400px] shadow-2xl">
            <h3 className="text-white font-bold text-base mb-1 flex items-center gap-2">
              <Plus size={18} className="text-indigo-400" />
              {t('quest_editor.sidebar.add_quest')}
            </h3>
            <p className="text-gray-500 text-xs mb-5">
              {t('settings.reload_cache_subtitle')}
            </p>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor.fields.quest_id')}</label>
                <input
                  type="number"
                  value={newId}
                  onChange={(e) => setNewId(Number(e.target.value))}
                  className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('quest_editor.fields.title')}</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleCreateQuest}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition-colors cursor-pointer"
              >
                {t('quest_editor.sidebar.add_quest')}
              </button>
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2.5 text-gray-400 hover:text-white bg-dark-900/60 border border-white/5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestEditor;
