/**
 * AchievementEditor.tsx — Main view container for managing, searching, and editing
 * rAthena achievement database records (achievement_db.yml + achievements.lub).
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import {
  Search, Trophy, Plus, Save, Compass, CheckCircle2,
  AlertTriangle, Sparkles, PlusCircle, Trash2
} from 'lucide-react';
import { ReferencePicker } from '../components/ReferencePicker';
import { SourceToggleBar } from '../components/SourceToggleBar';
import type { SourceTab } from '../components/SourceToggleBar';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { useLanguageStore } from '../store/useLanguageStore';
import { translateApiError } from '../utils/errors';
import { toast } from '../store/useToastStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientData {
  UI_Type: number;
  group: string;
  major: number;
  minor: number;
  title: string;
  summary: string;
  details: string;
  resource: string[];
  reward_item: number | null;
  reward_title: number | null;
  reward_buff: number | null;
  score: number;
}

interface ServerData {
  Id: number;
  Group: string;
  Name: string;
  Targets?: { Id: number; Mob?: string | number; Count: number }[];
  Condition?: string;
  Map?: string | number;
  Dependents?: Record<number, boolean>;
  Rewards?: {
    Item?: string;
    Amount?: number;
    Script?: string;
    TitleId?: number;
  };
  Score: number;
  /** Source annotation injected by the backend. */
  _source?: 'rathena' | 'custom';
}

interface UnifiedAchievement {
  Id: number;
  server: ServerData | null;
  client: ClientData | null;
  status: 'ok' | 'divergent' | 'server_only' | 'client_only';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AchievementEditor() {
  const t = useLanguageStore(state => state.t);
  const [achievements, setAchievements] = useState<UnifiedAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('achievement_editor.status.loading'));
  const [searchText, setSearchText] = useState('');
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // New Achievement modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newId, setNewId] = useState(120000);
  const [newName, setNewName] = useState('New Achievement Name');
  const [newTitle, setNewTitle] = useState('New Achievement Title');
  const [newGroup, setNewGroup] = useState('Adventure');

  // Reference picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<'item' | 'mob'>('item');
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number | null>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchAchievements = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/achievements/?limit=50000`);
      setAchievements(res.data.achievements || []);
    } catch {
      setLoadingStatus(t('achievement_editor.status.error_fetching'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  // ─── Derived lists ──────────────────────────────────────────────────────────

  const rathenaAchievements = useMemo(
    () => achievements.filter(a => a.server?._source === 'rathena' || (!a.server && a.client)),
    [achievements]
  );

  const customAchievements = useMemo(
    () => achievements.filter(a => a.server?._source === 'custom'),
    [achievements]
  );

  /** Distinct group names derived from all loaded achievements. */
  const groupsList = useMemo(() => {
    const s = new Set<string>();
    achievements.forEach(a => {
      if (a.server?.Group) s.add(a.server.Group);
      if (a.client?.group) s.add(a.client.group);
    });
    return Array.from(s).sort();
  }, [achievements]);

  /**
   * Returns the filtered achievement list based on source tab, search text,
   * status filter, and group filter.
   */
  const filteredAchievements = useMemo(() => {
    const sourceList = sourceTab === 'rathena' ? rathenaAchievements : customAchievements;

    return sourceList.filter(a => {
      const q = searchText.toLowerCase().trim();
      if (q) {
        const idStr = String(a.Id);
        const nameStr = (a.server?.Name || '').toLowerCase();
        const titleStr = (a.client?.title || '').toLowerCase();
        const descStr = (a.client?.summary || '').toLowerCase();
        if (!idStr.includes(q) && !nameStr.includes(q) && !titleStr.includes(q) && !descStr.includes(q)) {
          return false;
        }
      }
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterGroup !== 'all') {
        const sGroup = a.server?.Group?.toLowerCase();
        const cGroup = a.client?.group?.toLowerCase();
        const match = filterGroup.toLowerCase();
        if (sGroup !== match && cGroup !== match) return false;
      }
      return true;
    });
  }, [rathenaAchievements, customAchievements, sourceTab, searchText, filterStatus, filterGroup]);

  const selectedUnified = useMemo(
    () => achievements.find(a => a.Id === selectedId) || null,
    [achievements, selectedId]
  );

  /** Whether the currently selected achievement belongs to the custom (deletable) source. */
  const isSelectedCustom = selectedUnified?.server?._source === 'custom';

  // ─── Field helpers ──────────────────────────────────────────────────────────

  const updateServerField = (field: string, val: any) => {
    if (!selectedId) return;
    setAchievements(prev =>
      prev.map(a => {
        if (a.Id !== selectedId) return a;
        const newServer = { ...(a.server || { Id: selectedId, Name: '', Score: 10, Group: 'Adventure' }), [field]: val };
        return { ...a, server: newServer };
      })
    );
  };

  const updateClientField = (field: string, val: any) => {
    if (!selectedId) return;
    setAchievements(prev =>
      prev.map(a => {
        if (a.Id !== selectedId) return a;
        const newClient = {
          ...(a.client || {
            UI_Type: 0, group: 'ADVENTURE', major: 2, minor: 0,
            title: '', summary: '', details: '', resource: [],
            reward_item: null, reward_title: null, reward_buff: null, score: 10,
          }),
          [field]: val,
        };
        return { ...a, client: newClient };
      })
    );
  };

  // ─── Auto-generate client data from server ──────────────────────────────────

  const handleAutoGenerateClient = () => {
    if (!selectedUnified?.server) return;
    const s = selectedUnified.server;
    let cGroup = (s.Group || 'Adventure').toUpperCase();
    if (cGroup === 'CHATTING') cGroup = 'SEE';
    updateClientField('title', s.Name || 'New Achievement');
    updateClientField('group', cGroup);
    updateClientField('score', s.Score || 10);
    updateClientField('summary', s.Name || 'New Achievement');
    updateClientField('details', t('achievement_editor.autogenerate_details'));
    updateClientField('resource', s.Targets?.map((_, idx) => `${t('achievement_editor.autogenerate_condition')} ${idx + 1}`) || [t('achievement_editor.autogenerate_target')]);
    updateClientField('reward_title', s.Rewards?.TitleId || null);
  };

  // ─── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedUnified) return;
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/api/achievements/${selectedUnified.Id}`, {
        server_data: selectedUnified.server,
        client_data: selectedUnified.client,
      });
      toast.success(t('achievement_editor.save_success'));
      await fetchAchievements();
    } catch (err: any) {
      const errMsg = translateApiError(err?.response?.data?.detail, t) || err.message;
      toast.error(t('achievement_editor.save_error', { error: errMsg }));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  /**
   * Sends DELETE request to the backend, removes the achievement from local state
   * without a full page reload, and shows a success toast.
   */
  const handleDeleteAchievement = useCallback(async () => {
    if (!selectedUnified) return;
    const achId = selectedUnified.Id;
    setIsDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/achievements/${achId}`);
      setAchievements(prev => prev.filter(a => a.Id !== achId));
      setSelectedId(null);
      setShowDeleteModal(false);
      toast.success(
        (t('achievement_editor.delete_success') || 'Achievement #{{id}} deleted successfully.')
          .replace('{{id}}', String(achId))
      );
    } catch (error: any) {
      setShowDeleteModal(false);
      const status = error?.response?.status;
      if (status === 403) {
        toast.error(t('achievement_editor.delete_error_403'));
      } else {
        toast.error(error?.response?.data?.detail || t('achievement_editor.delete_error_generic'));
      }
    } finally {
      setIsDeleting(false);
    }
  }, [selectedUnified, t]);

  // ─── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newId || !newName.trim()) {
      toast.error(t('achievement_editor.create_fill_fields'));
      return;
    }

    try {
      const server: ServerData = { Id: newId, Group: newGroup, Name: newName, Score: 10, Targets: [] };
      const client: ClientData = {
        UI_Type: 0,
        group: newGroup.toUpperCase() === 'CHATTING' ? 'SEE' : newGroup.toUpperCase(),
        major: 2, minor: 0,
        title: newTitle || newName,
        summary: newTitle || newName,
        details: t('achievement_editor.autogenerate_details'),
        resource: [t('achievement_editor.autogenerate_target')],
        reward_item: null, reward_title: null, reward_buff: null,
        score: 10,
      };

      await axios.post(`${API_URL}/api/achievements/${newId}`, {
        server_data: server,
        client_data: client,
      });

      toast.success(t('achievement_editor.create_success'));
      setShowNewModal(false);
      await fetchAchievements();
      setSelectedId(newId);
      setSourceTab('custom');
    } catch (err: any) {
      const errMsg = translateApiError(err?.response?.data?.detail, t) || err.message;
      toast.error(t('achievement_editor.create_error', { error: errMsg }));
    }
  };

  // ─── Reference picker ───────────────────────────────────────────────────────

  const handleSelectReference = (id: number | string, name: string) => {
    if (!selectedUnified) return;
    if (pickerType === 'item') {
      updateClientField('reward_item', Number(id));
      const currentRewards = selectedUnified.server?.Rewards || {};
      updateServerField('Rewards', { ...currentRewards, Item: name });
    } else if (pickerType === 'mob' && pickerTargetIndex !== null) {
      const currentTargets = [...(selectedUnified.server?.Targets || [])];
      if (currentTargets[pickerTargetIndex]) {
        currentTargets[pickerTargetIndex].Mob = name;
        updateServerField('Targets', currentTargets);
      }
    }
    setPickerOpen(false);
  };

  // ─── Status badge ───────────────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <span className="text-[10px] bg-green-950/60 border border-green-800 text-green-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CheckCircle2 size={9} />{t('achievement_editor.badges.ok')}</span>;
      case 'divergent':
        return <span className="text-[10px] bg-amber-950/60 border border-amber-800 text-amber-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={9} />{t('achievement_editor.badges.divergent')}</span>;
      case 'server_only':
        return <span className="text-[10px] bg-violet-950/60 border border-violet-800 text-violet-400 px-2 py-0.5 rounded-full font-bold">{t('achievement_editor.badges.server_only')}</span>;
      case 'client_only':
        return <span className="text-[10px] bg-cyan-950/60 border border-cyan-800 text-cyan-400 px-2 py-0.5 rounded-full font-bold">{t('achievement_editor.badges.client_only')}</span>;
      default:
        return null;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full bg-[#0f0f14] overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-[380px] min-w-[380px] border-r border-[#1e1e2e] bg-[#12121a] flex flex-col h-full flex-shrink-0">

        <div className="p-4 border-b border-[#1e1e2e] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-sm flex items-center gap-2">
              <Trophy size={16} className="text-violet-400" />
              {t('achievement_editor.sidebar.title')}
            </h2>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs rounded-lg transition-colors"
            >
              <Plus size={13} /> {t('achievement_editor.sidebar.create_btn')}
            </button>
          </div>

          {/* Source Toggle */}
          <SourceToggleBar
            value={sourceTab}
            onChange={(tab) => { setSourceTab(tab); setSelectedId(null); }}
            countRathena={rathenaAchievements.length}
            countCustom={customAchievements.length}
            accentColor="violet"
          />

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={t('achievement_editor.sidebar.search_placeholder')}
              className="w-full bg-[#0f0f14] border border-white/5 hover:border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          {/* Status & Group filters */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-[#0f0f14] border border-white/5 rounded-xl px-3 py-1.5 text-[11px] text-gray-400 focus:outline-none cursor-pointer"
            >
              <option value="all">{t('achievement_editor.sidebar.filter_sync_all')}</option>
              <option value="ok">{t('achievement_editor.badges.ok')}</option>
              <option value="divergent">{t('achievement_editor.badges.divergent')}</option>
              <option value="server_only">{t('achievement_editor.badges.server_only')}</option>
              <option value="client_only">{t('achievement_editor.badges.client_only')}</option>
            </select>
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              className="bg-[#0f0f14] border border-white/5 rounded-xl px-3 py-1.5 text-[11px] text-gray-400 focus:outline-none cursor-pointer"
            >
              <option value="all">{t('achievement_editor.sidebar.filter_group_all')}</option>
              {groupsList.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Virtuoso list */}
        <div className="flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500">
              <span className="text-xs">{loadingStatus}</span>
            </div>
          ) : filteredAchievements.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-gray-600">
              {t('achievement_editor.sidebar.no_achievements')}
            </div>
          ) : (
            <Virtuoso
              data={filteredAchievements}
              itemContent={(idx, ach) => {
                const isSelected = selectedId === ach.Id;
                const name = ach.client?.title || ach.server?.Name || 'Unnamed Achievement';
                const group = ach.server?.Group || ach.client?.group || 'None';
                return (
                  <div
                    onClick={() => setSelectedId(ach.Id)}
                    className={`mx-2 my-1 px-4 py-3 rounded-xl cursor-pointer border transition-all ${
                      isSelected
                        ? 'bg-violet-600/10 border-violet-500/30 shadow'
                        : 'bg-dark-900/40 hover:bg-dark-800/40 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-400 font-mono">ID: {ach.Id}</span>
                      {getStatusBadge(ach.status)}
                    </div>
                    <h3 className="text-white font-medium text-xs truncate mb-1.5">{name}</h3>
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                      <span>{group}</span>
                      <span className="text-violet-400">{ach.server?.Score || ach.client?.score || 0} pts</span>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* ── Detail Panel ── */}
      <div className="flex-1 flex flex-col h-full bg-[#0f0f14] overflow-hidden">
        {selectedUnified ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-white">
                    {selectedUnified.client?.title || selectedUnified.server?.Name || 'Unnamed'}
                  </h2>
                  {getStatusBadge(selectedUnified.status)}
                </div>
                <div className="text-xs font-mono text-gray-500 flex items-center gap-3">
                  <span>ID: <span className="text-violet-400">{selectedUnified.Id}</span></span>
                  <span>YML: <span className="text-gray-400">{selectedUnified.server?._source || t('achievement_editor.detail.not_exists')}</span></span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedUnified.status === 'server_only' && (
                  <button
                    type="button"
                    onClick={handleAutoGenerateClient}
                    className="flex items-center gap-1.5 px-4 py-2 border border-violet-500/20 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 text-xs font-bold rounded-xl transition-all"
                  >
                    <Sparkles size={13} /> {t('achievement_editor.detail.generate_lua')}
                  </button>
                )}

                {/* Delete button — only enabled for custom achievements */}
                <button
                  type="button"
                  data-testid="btn-delete-entry"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={!isSelectedCustom}
                  title={!isSelectedCustom ? t('achievement_editor.delete_rathena_tooltip') : t('achievement_editor.delete_tooltip')}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-500/20 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} /> {t('common.delete')}
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
                >
                  <Save size={13} /> {isSaving ? t('achievement_editor.detail.loading_btn') : t('achievement_editor.detail.save_changes')}
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* COLUMN A: Client texts */}
                <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-4">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2 pb-3 border-b border-white/5">
                    <Trophy size={14} className="text-cyan-400" />
                    {t('achievement_editor.visual_texts.title')}
                  </h3>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.visual_texts.display_title')}</label>
                    <input type="text" value={selectedUnified.client?.title || ''} onChange={e => updateClientField('title', e.target.value)} placeholder={t('achievement_editor.visual_texts.display_title_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500/60" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.visual_texts.summary')}</label>
                    <input type="text" value={selectedUnified.client?.summary || ''} onChange={e => updateClientField('summary', e.target.value)} placeholder={t('achievement_editor.visual_texts.summary_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500/60" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.visual_texts.detailed_desc')}</label>
                    <textarea rows={3} value={selectedUnified.client?.details || ''} onChange={e => updateClientField('details', e.target.value)} placeholder={t('achievement_editor.visual_texts.detailed_desc_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500/60 resize-none" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide flex items-center justify-between">
                      {t('achievement_editor.visual_texts.checklist_label')}
                      <button
                        type="button"
                        onClick={() => {
                          const res = selectedUnified.client?.resource || [];
                          updateClientField('resource', [...res, t('achievement_editor.visual_texts.new_objective')]);
                        }}
                        className="text-[10px] text-violet-400 hover:text-violet-300"
                      >
                        {t('achievement_editor.visual_texts.add_line')}
                      </button>
                    </label>
                    <div className="space-y-2">
                      {(selectedUnified.client?.resource || []).map((text, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-500">[{idx + 1}]</span>
                          <input
                            type="text"
                            value={text}
                            onChange={e => {
                              const res = [...(selectedUnified.client?.resource || [])];
                              res[idx] = e.target.value;
                              updateClientField('resource', res);
                            }}
                            className="flex-1 bg-[#0f0f14] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const res = (selectedUnified.client?.resource || []).filter((_, i) => i !== idx);
                              updateClientField('resource', res);
                            }}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* COLUMN B: Server conditions */}
                <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-4">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2 pb-3 border-b border-white/5">
                    <Compass size={14} className="text-violet-400" />
                    {t('achievement_editor.server_yml.title')}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.server_yml.group')}</label>
                      <input type="text" value={selectedUnified.server?.Group || ''} onChange={e => updateServerField('Group', e.target.value)} placeholder={t('achievement_editor.server_yml.group_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.server_yml.score')}</label>
                      <input type="number" value={selectedUnified.server?.Score ?? 0} onChange={e => { const val = Number(e.target.value); updateServerField('Score', val); updateClientField('score', val); }} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide flex items-center gap-1.5">
                      {t('achievement_editor.server_yml.condition_expr')}
                      <span className="text-[9px] text-gray-600 font-normal normal-case">{t('achievement_editor.server_yml.condition_expr_hint')}</span>
                    </label>
                    <input type="text" value={selectedUnified.server?.Condition || ''} onChange={e => updateServerField('Condition', e.target.value)} placeholder={t('achievement_editor.server_yml.condition_expr_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide flex items-center justify-between">
                      {t('achievement_editor.server_yml.targets')}
                      <button
                        type="button"
                        onClick={() => {
                          const targets = selectedUnified.server?.Targets || [];
                          updateServerField('Targets', [...targets, { Id: targets.length, Mob: 'PORING', Count: 1 }]);
                        }}
                        className="text-[10px] text-violet-400 hover:text-violet-300"
                      >
                        {t('achievement_editor.server_yml.add_target')}
                      </button>
                    </label>
                    <div className="space-y-3">
                      {(selectedUnified.server?.Targets || []).map((target, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-[#0f0f14] p-2 rounded-xl border border-white/5">
                          <span className="text-[10px] text-gray-500 font-mono">#{target.Id}</span>
                          <div className="flex-1 relative flex items-center">
                            <input
                              type="text"
                              value={target.Mob || ''}
                              onChange={e => {
                                const tgts = [...(selectedUnified.server?.Targets || [])];
                                tgts[idx].Mob = e.target.value;
                                updateServerField('Targets', tgts);
                              }}
                              placeholder={t('achievement_editor.server_yml.mob_placeholder')}
                              className="w-full bg-dark-900 border border-white/5 rounded-lg px-2.5 py-1 text-xs text-gray-300 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => { setPickerType('mob'); setPickerTargetIndex(idx); setPickerOpen(true); }}
                              className="absolute right-2 text-violet-400 hover:text-violet-300 text-[10px]"
                            >
                              {t('achievement_editor.server_yml.search_btn')}
                            </button>
                          </div>
                          <input
                            type="number"
                            value={target.Count}
                            onChange={e => {
                              const tgts = [...(selectedUnified.server?.Targets || [])];
                              tgts[idx].Count = Number(e.target.value);
                              updateServerField('Targets', tgts);
                            }}
                            placeholder={t('achievement_editor.server_yml.qty')}
                            className="w-16 bg-dark-900 border border-white/5 rounded-lg px-2.5 py-1 text-xs text-gray-300 text-center focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const tgts = (selectedUnified.server?.Targets || []).filter((_, i) => i !== idx);
                              updateServerField('Targets', tgts);
                            }}
                            className="text-gray-500 hover:text-red-400 transition-colors px-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.server_yml.map')}</label>
                    <input type="text" value={selectedUnified.server?.Map || ''} onChange={e => updateServerField('Map', e.target.value)} placeholder={t('achievement_editor.server_yml.map_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Rewards row */}
              <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-white font-bold text-sm flex items-center gap-2 pb-3 border-b border-white/5">
                  <Sparkles size={14} className="text-yellow-500" />
                  {t('achievement_editor.rewards.title')}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.rewards.item')}</label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={selectedUnified.server?.Rewards?.Item || ''}
                        onChange={e => {
                          const current = selectedUnified.server?.Rewards || {};
                          updateServerField('Rewards', { ...current, Item: e.target.value });
                        }}
                        placeholder={t('achievement_editor.rewards.item_placeholder')}
                        className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500/60 pr-12"
                      />
                      <button type="button" onClick={() => { setPickerType('item'); setPickerOpen(true); }} className="absolute right-3 text-violet-400 hover:text-violet-300 text-[10px]">
                        {t('achievement_editor.rewards.search_btn')}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 px-1 mt-1 font-mono">
                      <span>{t('achievement_editor.rewards.client_id')}</span>
                      <span className="text-cyan-400">{selectedUnified.client?.reward_item || t('achievement_editor.rewards.none')}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.rewards.qty')}</label>
                    <input type="number" value={selectedUnified.server?.Rewards?.Amount ?? 1} onChange={e => { const current = selectedUnified.server?.Rewards || {}; updateServerField('Rewards', { ...current, Amount: Number(e.target.value) }); }} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.rewards.title_reward')}</label>
                    <input type="number" value={selectedUnified.client?.reward_title ?? 0} onChange={e => { const val = Number(e.target.value); updateClientField('reward_title', val); const current = selectedUnified.server?.Rewards || {}; updateServerField('Rewards', { ...current, TitleId: val }); }} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.rewards.bonus_script')}</label>
                  <input type="text" value={selectedUnified.server?.Rewards?.Script || ''} onChange={e => { const current = selectedUnified.server?.Rewards || {}; updateServerField('Rewards', { ...current, Script: e.target.value }); }} placeholder={t('achievement_editor.rewards.bonus_script_placeholder')} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
            <Trophy size={40} className="stroke-[1.5] text-gray-700 animate-pulse" />
            <span className="text-xs font-semibold">{t('achievement_editor.no_selection')}</span>
          </div>
        )}
      </div>

      {/* ── Reference Picker ── */}
      <ReferencePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectReference}
        type={pickerType}
      />

      {/* ── Delete Confirm Modal ── */}
      <div data-testid="modal-confirm-delete">
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          entityLabel={`Achievement #${selectedUnified?.Id} — ${selectedUnified?.client?.title || selectedUnified?.server?.Name || ''}`}
          isDeleting={isDeleting}
          onConfirm={handleDeleteAchievement}
          onCancel={() => setShowDeleteModal(false)}
        />
      </div>

      {/* ── New Achievement Modal ── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-[450px] shadow-2xl">
            <h3 className="text-white font-bold text-base mb-1 flex items-center gap-2">
              <PlusCircle size={16} className="text-violet-400" />
              {t('achievement_editor.create_modal.title')}
            </h3>
            <p className="text-gray-500 text-xs mb-5">{t('achievement_editor.create_modal.subtitle')}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.create_modal.unique_id')}</label>
                  <input type="number" value={newId} onChange={e => setNewId(Number(e.target.value))} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.create_modal.initial_group')}</label>
                  <select value={newGroup} onChange={e => setNewGroup(e.target.value)} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none">
                    <option value="Adventure">Adventure</option>
                    <option value="Battle">Battle</option>
                    <option value="Quest">Quest</option>
                    <option value="Level">Level</option>
                    <option value="Eat">Eat</option>
                    <option value="Chatting">Chatting</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.create_modal.server_name')}</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{t('achievement_editor.create_modal.client_title')}</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button type="button" onClick={handleCreate} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow transition-colors">
                {t('achievement_editor.create_modal.create_btn')}
              </button>
              <button type="button" onClick={() => setShowNewModal(false)} className="px-4 py-2.5 text-gray-400 hover:text-white bg-dark-900/60 border border-white/5 rounded-xl text-xs transition-colors">
                {t('achievement_editor.create_modal.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
