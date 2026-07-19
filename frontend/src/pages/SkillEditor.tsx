/**
 * SkillEditor.tsx — Comprehensive visual studio and editor page for rAthena skills database.
 */

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Zap, Database, Sparkles, Save, Shield, Clock, Sliders, Box, Layers, Plus, Trash2, Coins, Activity, ShieldAlert, Award, Sword, DownloadCloud, CheckCircle, AlertCircle } from 'lucide-react';
import { LevelArrayEditor } from '../components/LevelArrayEditor';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';
import { useLanguageStore } from '../store/useLanguageStore';
import { localizeLoadingStatus } from '../utils/i18nHelpers';
import { DivinePrideImporterPanel } from '../components/DivinePrideImporterPanel';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import CreateSkillModal from '../components/CreateSkillModal';

/** Available source filter tabs. */
type SourceTab = 'rathena' | 'custom';

/**
 * Main skill editor interface allowing filtering, creation, import, and deep property modification across skill attributes.
 */
export const SkillEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [skills, setSkills] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('skill_editor.status.connecting'));
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'dano' | 'tempo' | 'requisitos' | 'unidade'>('geral');
  const [isSaving, setIsSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showDPPanel, setShowDPPanel] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [pickerConfig, setPickerConfig] = useState<{ open: boolean; type: 'item' | 'mob' | 'skill'; targetKey?: string }>({ open: false, type: 'item' });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };
  const [itemsMap, setItemsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    axios.get(`${API_URL}/api/items/references?t=${Date.now()}`)
      .then(res => {
        const map: Record<string, any> = {};
        (res.data.items || []).forEach((item: any) => {
          const aegisName = item.AegisName || String(item.Id);
          map[aegisName.toLowerCase()] = item;
        });
        setItemsMap(map);
      })
      .catch(err => console.error("Erro ao carregar mapa de itens:", err));
  }, []);

  useEffect(() => {
    let intervalId: any;
    const fetchSkills = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/skills/?limit=100000`);
        setSkills(res.data.skills || []);
        setIsLoading(false);
      } catch (err) {
        console.error("Erro ao carregar skills:", err);
        setLoadingStatus(t('skill_editor.status.error_fetching'));
      }
    };

    const checkStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/skills/status`);
        setLoadingStatus(localizeLoadingStatus(res.data.message, t));
        if (!res.data.is_loading && res.data.message !== "Aguardando inicialização...") {
          if (intervalId) clearInterval(intervalId);
          fetchSkills();
        }
      } catch (err) {
        setLoadingStatus(t('skill_editor.status.checking'));
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 1500);
    return () => clearInterval(intervalId);
  }, [t]);

  const rathenaSkills = useMemo(() => skills.filter(s => s._source === 'rathena'), [skills]);
  const customSkills = useMemo(() => skills.filter(s => s._source === 'custom'), [skills]);

  const filteredSkills = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaSkills : customSkills;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(s => 
      String(s.Id).includes(q) || 
      String(s.Name || '').toLowerCase().includes(q) ||
      String(s.Description || '').toLowerCase().includes(q)
    );
  }, [rathenaSkills, customSkills, sourceTab, searchText]);

  const selectedSkill = useMemo(() => {
    return skills.find(s => s.Id === selectedSkillId) || null;
  }, [skills, selectedSkillId]);

  const handleDPImportSuccess = (mappedData: any) => {
    if (!selectedSkill) return;
    setSkills(prev => prev.map(s => {
      if (s.Id === selectedSkill.Id) {
        return { ...s, ...mappedData, Id: selectedSkill.Id };
      }
      return s;
    }));
    showToast(t('divinepride.import_success' as any) || 'Habilidade importada do Divine Pride com sucesso!', 'success');
  };


  const handleUpdateField = (fieldKey: string, value: any) => {
    if (!selectedSkill) return;
    setSkills(prev => prev.map(s => {
      if (s.Id === selectedSkill.Id) {
        return { ...s, [fieldKey]: value };
      }
      return s;
    }));
  };

  const handleUpdateNestedField = (parentKey: string, childKey: string, value: any) => {
    if (!selectedSkill) return;
    setSkills(prev => prev.map(s => {
      if (s.Id === selectedSkill.Id) {
        const parent = { ...(s[parentKey] || {}) };
        parent[childKey] = value;
        return { ...s, [parentKey]: parent };
      }
      return s;
    }));
  };

  const handleSave = async () => {
    if (!selectedSkill) return;
    setIsSaving(true);
    try {
      if (isNew || selectedSkill._isDraft) {
        const payload = { ...selectedSkill };
        delete payload._isDraft;
        const res = await axios.post(`${API_URL}/api/skills/`, {
          data: payload
        });
        const created = res.data;
        setSkills(prev => prev.map(s => s.Id === selectedSkill.Id ? { ...created, _source: 'custom' } : s));
        setIsNew(false);
        setSourceTab('custom');
        showToast(t('skill_editor.create_success' as any) || t('skill_editor.save_success'), 'success');
      } else {
        const res = await axios.put(`${API_URL}/api/skills/${selectedSkill.Id}`, {
          data: selectedSkill
        });
        const saved = res.data;
        setSkills(prev => prev.map(s => s.Id === saved.Id ? { ...saved, _source: 'custom' } : s));
        setSourceTab('custom');
        showToast(t('skill_editor.save_success'), 'success');
      }
    } catch (err: any) {
      console.error("Erro ao salvar skill:", err);
      showToast(err?.response?.data?.detail || t('skill_editor.save_error'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewSkill = () => {
    setIsCreateModalOpen(true);
  };

  const handleDeleteSkill = async () => {
    if (!selectedSkill) return;
    setIsDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/skills/${selectedSkill.Id}`);
      showToast(t('skill_editor.delete_success' as any) || 'Habilidade excluída com sucesso!', 'success');
      setSkills(prev => prev.filter(s => s.Id !== selectedSkill.Id));
      setSelectedSkillId(null);
      setIsNew(false);
    } catch (err: any) {
      console.error("Erro ao excluir skill:", err);
      if (err?.response?.status === 403) {
        showToast(err.response.data.detail || t('skill_editor.delete_error' as any), 'error');
      } else {
        showToast(t('skill_editor.delete_error' as any) || 'Erro ao excluir habilidade.', 'error');
      }
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Zap size={18} className="text-amber-500" /> {t('skill_editor.sidebar.title')}
            </h2>
            <button
              type="button"
              onClick={handleCreateNewSkill}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all cursor-pointer"
              title={t('skill_editor.sidebar.new_skill' as any) || 'Nova Skill'}
            >
              <Plus size={14} />
              <span>{t('skill_editor.sidebar.new_skill' as any) || 'Nova Skill'}</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedSkillId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-amber-600/80 text-white shadow-md shadow-amber-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} /> rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaSkills.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedSkillId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} /> Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {customSkills.length.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={t('skill_editor.sidebar.search_placeholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-gray-500 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
              <span className="text-xs">{loadingStatus}</span>
            </div>
          ) : (
            <Virtuoso
              data={filteredSkills}
              style={{ height: '100%' }}
              itemContent={(index, skill) => {
                const isSelected = selectedSkillId === skill.Id;
                const isCustom = skill._source === 'custom';
                return (
                  <div
                    onClick={() => {
                      setSelectedSkillId(skill.Id);
                      setIsNew(false);
                    }}
                    className={`flex items-center justify-between p-3 cursor-pointer border-b border-white/5 transition-all duration-150 ${
                      isSelected
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-amber-600/20 to-transparent border-l-2 border-l-amber-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-sm truncate font-medium ${isSelected ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {skill.Description || skill.Name || `${t('skill_editor.sidebar.title')} #${skill.Id}`}
                      </span>
                      <span className={`text-[11px] truncate font-mono ${isSelected ? (isCustom ? 'text-emerald-300' : 'text-amber-300') : 'text-gray-500'}`}>
                        #{skill.Id} — {skill.Name}
                      </span>
                    </div>
                    <span className="text-[10px] bg-dark-900 text-gray-400 font-mono px-1.5 py-0.5 rounded border border-white/5">
                      Lv {skill.MaxLevel || 1}
                    </span>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-hidden relative">
        {selectedSkill ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-[#12121a]/80 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 bg-dark-800 px-2 py-0.5 rounded border border-white/10 text-xs font-mono">
                    <span>ID: <span className="text-amber-400">{selectedSkill.Id}</span></span>
                    <button
                      type="button"
                      onClick={() => setShowDPPanel(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer"
                      title={t('divinepride.import_button')}
                    >
                      <DownloadCloud size={13} />
                      <span>{t('divinepride.import_button')}</span>
                    </button>
                  </span>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${selectedSkill._source === 'custom' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-dark-800 text-gray-400'}`}>
                    {selectedSkill._source === 'custom' ? t('skill_editor.source.custom') : t('skill_editor.source.rathena')}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-white mt-1">
                  {selectedSkill.Description || selectedSkill.Name}
                </h1>
                <span className="text-xs font-mono text-gray-400">{selectedSkill.Name}</span>
              </div>
              <div className="flex items-center gap-2">
                {!isNew && !selectedSkill._isDraft && selectedSkill._source === 'custom' && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer"
                    title={t('skill_editor.delete_button' as any) || 'Excluir Habilidade'}
                  >
                    <Trash2 size={16} />
                    <span>{t('skill_editor.delete_button' as any) || 'Excluir'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-amber-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save size={16} />
                  <span>{isSaving ? t('common.saving') : t('skill_editor.detail.save_button')}</span>
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-dark-800 bg-dark-900/40 px-4 gap-4">
              {[
                { id: 'geral', label: t('skill_editor.tabs.general'), icon: Sliders },
                { id: 'dano', label: t('skill_editor.tabs.combat'), icon: Shield },
                { id: 'tempo', label: t('skill_editor.tabs.timing'), icon: Clock },
                { id: 'requisitos', label: t('skill_editor.tabs.requirements'), icon: Layers },
                { id: 'unidade', label: t('skill_editor.tabs.unit'), icon: Box },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-amber-500 text-amber-400'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'geral' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">ID (Chave Primária / Imutável)</label>
                    <input
                      type="number"
                      value={selectedSkill.Id || ''}
                      disabled
                      readOnly
                      className="bg-dark-950 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-amber-400/80 cursor-not-allowed opacity-75"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.aegis_name')}</label>
                    <input
                      type="text"
                      value={selectedSkill.Name || ''}
                      onChange={(e) => handleUpdateField('Name', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.description')}</label>
                    <input
                      type="text"
                      value={selectedSkill.Description || ''}
                      onChange={(e) => handleUpdateField('Description', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.max_level')}</label>
                    <input
                      type="number"
                      value={selectedSkill.MaxLevel || 1}
                      onChange={(e) => handleUpdateField('MaxLevel', parseInt(e.target.value) || 1)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.type')}</label>
                    <select
                      value={selectedSkill.Type || 'None'}
                      onChange={(e) => handleUpdateField('Type', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    >
                      {['None', 'Weapon', 'Magic', 'Misc'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.target_type')}</label>
                    <select
                      value={selectedSkill.TargetType || 'Passive'}
                      onChange={(e) => handleUpdateField('TargetType', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    >
                      {['Passive', 'Attack', 'Target', 'Ground', 'Self', 'Friend', 'Party', 'Guild'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.range')}</label>
                    <LevelArrayEditor
                      label={t('skill_editor.fields.range_cells')}
                      value={selectedSkill.Range}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Size"
                      onChange={(val) => handleUpdateField('Range', val)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'dano' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LevelArrayEditor
                      label={t('skill_editor.fields.hit_count')}
                      value={selectedSkill.HitCount}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Count"
                      onChange={(val) => handleUpdateField('HitCount', val)}
                    />
                    <LevelArrayEditor
                      label={t('skill_editor.fields.splash_area')}
                      value={selectedSkill.SplashArea}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Area"
                      onChange={(val) => handleUpdateField('SplashArea', val)}
                    />
                    <LevelArrayEditor
                      label={t('skill_editor.fields.knockback')}
                      value={selectedSkill.Knockback}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Amount"
                      onChange={(val) => handleUpdateField('Knockback', val)}
                    />
                    <div className="flex flex-col gap-1 bg-dark-900/50 p-3 rounded border border-dark-800">
                      <label className="text-xs font-medium text-gray-300 mb-1">{t('skill_editor.fields.hit')}</label>
                      <select
                        value={selectedSkill.Hit || 'Normal'}
                        onChange={(e) => handleUpdateField('Hit', e.target.value)}
                        className="bg-dark-950 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                      >
                        {['Normal', 'Single', 'Multi_Hit'].map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tempo' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LevelArrayEditor
                    label={t('skill_editor.fields.cast_time')}
                    value={selectedSkill.CastTime}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('CastTime', val)}
                  />
                  <LevelArrayEditor
                    label={t('skill_editor.fields.fixed_cast')}
                    value={selectedSkill.FixedCastTime}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('FixedCastTime', val)}
                  />
                  <LevelArrayEditor
                    label={t('skill_editor.fields.animation_delay')}
                    value={selectedSkill.AfterCastActDelay}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('AfterCastActDelay', val)}
                  />
                  <LevelArrayEditor
                    label={t('skill_editor.fields.cooldown')}
                    value={selectedSkill.Cooldown}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('Cooldown', val)}
                  />
                  <LevelArrayEditor
                    label={t('skill_editor.fields.duration1')}
                    value={selectedSkill.Duration1}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('Duration1', val)}
                  />
                  <LevelArrayEditor
                    label={t('skill_editor.fields.duration2')}
                    value={selectedSkill.Duration2}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('Duration2', val)}
                  />
                </div>
              )}

              {activeTab === 'requisitos' && (
                <div className="space-y-6">
                  {/* --- CostPanel: Base Resource Costs --- */}
                  <div className="bg-[#12121a] border border-white/5 rounded-xl p-5 shadow-lg space-y-4">
                    <h3 className="text-gray-200 font-semibold text-sm flex items-center gap-2">
                      <Activity size={16} className="text-rose-500" />
                      {t('skill_editor.requirements_panel.base_costs_title')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <LevelArrayEditor
                        label={t('skill_editor.fields.sp_cost')}
                        value={selectedSkill.Requires?.SpCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'SpCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.hp_cost')}
                        value={selectedSkill.Requires?.HpCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'HpCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.ap_cost')}
                        value={selectedSkill.Requires?.ApCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'ApCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.zeny_cost')}
                        value={selectedSkill.Requires?.ZenyCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'ZenyCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.hp_rate_cost')}
                        value={selectedSkill.Requires?.HpRateCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'HpRateCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.sp_rate_cost')}
                        value={selectedSkill.Requires?.SpRateCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'SpRateCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.ap_rate_cost')}
                        value={selectedSkill.Requires?.ApRateCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'ApRateCost', val)}
                      />
                      <LevelArrayEditor
                        label={t('skill_editor.fields.max_hp_trigger')}
                        value={selectedSkill.Requires?.MaxHpTrigger}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'MaxHpTrigger', val)}
                      />
                    </div>
                  </div>

                  {/* --- RequirementPanel: Weapon & Ammo --- */}
                  <div className="bg-[#12121a] border border-white/5 rounded-xl p-5 shadow-lg space-y-4">
                    <h3 className="text-gray-200 font-semibold text-sm flex items-center gap-2">
                      <Sword size={16} className="text-blue-500" />
                      {t('skill_editor.requirements_panel.combat_title')}
                    </h3>
                    
                    {/* Weapons Multi-Select Tag Layout */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-gray-400">
                          {t('skill_editor.fields.weapons')}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleUpdateNestedField('Requires', 'Weapon', undefined)}
                          className="text-[10px] bg-dark-800 hover:bg-dark-700 text-gray-400 px-2 py-0.5 rounded transition-colors"
                        >
                          {t('skill_editor.requirements_panel.any_weapon')}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 p-3 bg-dark-900/40 rounded-lg border border-white/5">
                        {[
                          'Fist', 'Dagger', '1hSword', '2hSword', '1hSpear', '2hSpear',
                          '1hAxe', '2hAxe', 'Mace', '2hMace', 'Staff', 'Knuckle',
                          'Musical', 'Whip', 'Book', 'Katar', 'Revolver', 'Rifle',
                          'Gatling', 'Shotgun', 'Grenade', 'Huuma'
                        ].map(wp => {
                          const isRequired = selectedSkill.Requires?.Weapon?.[wp] === true;
                          return (
                            <button
                              key={wp}
                              type="button"
                              onClick={() => {
                                const current = { ...(selectedSkill.Requires?.Weapon || {}) };
                                if (current[wp]) {
                                  delete current[wp];
                                } else {
                                  current[wp] = true;
                                }
                                handleUpdateNestedField('Requires', 'Weapon', Object.keys(current).length > 0 ? current : undefined);
                              }}
                              className={`px-2.5 py-1 rounded text-xs font-semibold font-mono border transition-all ${
                                isRequired
                                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                                  : 'bg-dark-900 border-white/5 text-gray-500 hover:text-gray-300'
                              }`}
                            >
                              {wp}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ammo Toggle List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 block">
                          {t('skill_editor.fields.ammo')}
                        </label>
                        <div className="flex flex-wrap gap-1.5 p-3 bg-dark-900/40 rounded-lg border border-white/5">
                          {['Arrow', 'Dagger', 'Bullet', 'Shell', 'Grenade', 'Shuriken', 'Kunai', 'Cannonball'].map(am => {
                            const isRequired = selectedSkill.Requires?.Ammo?.[am] === true;
                            return (
                              <button
                                key={am}
                                type="button"
                                onClick={() => {
                                  const current = { ...(selectedSkill.Requires?.Ammo || {}) };
                                  if (current[am]) {
                                    delete current[am];
                                  } else {
                                    current[am] = true;
                                  }
                                  handleUpdateNestedField('Requires', 'Ammo', Object.keys(current).length > 0 ? current : undefined);
                                }}
                                className={`px-2.5 py-1 rounded text-xs font-semibold font-mono border transition-all ${
                                  isRequired
                                    ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                    : 'bg-dark-900 border-white/5 text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {am}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <LevelArrayEditor
                        label={t('skill_editor.fields.ammo_amount')}
                        value={selectedSkill.Requires?.AmmoAmount}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'AmmoAmount', val)}
                      />
                    </div>
                  </div>

                  {/* --- RequirementPanel: States, Status & Monk Fury --- */}
                  <div className="bg-[#12121a] border border-white/5 rounded-xl p-5 shadow-lg space-y-4">
                    <h3 className="text-gray-200 font-semibold text-sm flex items-center gap-2">
                      <ShieldAlert size={16} className="text-violet-500" />
                      {t('skill_editor.requirements_panel.special_title')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.state')}</label>
                        <select
                          value={selectedSkill.Requires?.State || 'None'}
                          onChange={(e) => handleUpdateNestedField('Requires', 'State', e.target.value === 'None' ? undefined : e.target.value)}
                          className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                        >
                          {['None', 'Water', 'Riding', 'Falcon', 'Cart', 'Shield', 'Hiding', 'Cloaking', 'ExplosionSpirits', 'Mado', 'Dragon', 'Warg'].map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.status')}</label>
                        <input
                          type="text"
                          value={selectedSkill.Requires?.Status || ''}
                          placeholder={t('skill_editor.requirements_panel.status_placeholder')}
                          onChange={(e) => handleUpdateNestedField('Requires', 'Status', e.target.value.trim() || undefined)}
                          className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.equipment')}</label>
                        <input
                          type="text"
                          value={selectedSkill.Requires?.Equipment || ''}
                          placeholder={t('skill_editor.requirements_panel.equipment_placeholder')}
                          onChange={(e) => handleUpdateNestedField('Requires', 'Equipment', e.target.value.trim() || undefined)}
                          className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                      </div>

                      <LevelArrayEditor
                        label={t('skill_editor.fields.spheres')}
                        value={selectedSkill.Requires?.SpiritSphereCost}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Amount"
                        onChange={(val) => handleUpdateNestedField('Requires', 'SpiritSphereCost', val)}
                      />
                    </div>
                  </div>

                  {/* --- ConsumablesPanel: Required Consumables --- */}
                  <div className="bg-[#12121a] border border-white/5 rounded-xl p-5 shadow-lg space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-gray-200 font-semibold text-sm flex items-center gap-2">
                          <Layers size={16} className="text-amber-500" />
                          {t('skill_editor.fields.consumables')}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {t('skill_editor.requirements_panel.consumables_desc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerConfig({ open: true, type: 'item' })}
                        className="flex items-center gap-1 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      >
                        <Plus size={13} />
                        {t('skill_editor.fields.add_consumable')}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {!(selectedSkill.Requires?.ItemCost) || selectedSkill.Requires.ItemCost.length === 0 ? (
                        <div className="p-8 text-center text-xs text-gray-600 font-mono bg-dark-950 border border-white/5 rounded-lg">
                          {t('skill_editor.requirements_panel.no_consumables')}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          {selectedSkill.Requires.ItemCost.map((itReq: any, index: number) => {
                            const cachedItem = itemsMap[itReq.Item.toLowerCase()];
                            const itemId = cachedItem?.Id;
                            const displayName = cachedItem?.Name || itReq.Item;

                            return (
                              <div
                                key={index}
                                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-dark-950 border border-white/5 rounded-lg gap-3"
                              >
                                <div className="flex items-center gap-3">
                                  {/* Inventory Sprite Icon loaded from GRF */}
                                  <div className="w-10 h-10 bg-dark-900 border border-white/5 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                    {itemId ? (
                                      <img
                                        src={`${API_URL}/api/grf/sprite?type=item&id=${itemId}`}
                                        className="w-8 h-8 object-contain"
                                        alt=""
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <span className="text-xs text-gray-600">?</span>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-gray-200">
                                      {displayName}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                                      {itReq.Item} {itemId ? `(#${itemId})` : ''}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="text-gray-500">{t('skill_editor.requirements_panel.quantity')}</span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={itReq.Amount}
                                      onChange={(e) => {
                                        const updatedList = [...selectedSkill.Requires.ItemCost];
                                        updatedList[index] = { ...updatedList[index], Amount: parseInt(e.target.value) || 1 };
                                        handleUpdateNestedField('Requires', 'ItemCost', updatedList);
                                      }}
                                      className="w-16 bg-dark-900 border border-dark-700 rounded px-2 py-0.5 font-mono text-white text-center text-xs"
                                    />
                                  </div>

                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="text-gray-500">{t('skill_editor.requirements_panel.level')}</span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={itReq.Level || ''}
                                      placeholder={t('skill_editor.requirements_panel.all')}
                                      onChange={(e) => {
                                        const updatedList = [...selectedSkill.Requires.ItemCost];
                                        const lv = parseInt(e.target.value);
                                        if (isNaN(lv) || lv <= 0) {
                                          delete updatedList[index].Level;
                                        } else {
                                          updatedList[index].Level = lv;
                                        }
                                        handleUpdateNestedField('Requires', 'ItemCost', updatedList);
                                      }}
                                      className="w-16 bg-dark-900 border border-dark-700 rounded px-2 py-0.5 font-mono text-white text-center text-xs"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedList = selectedSkill.Requires.ItemCost.filter((_: any, idx: number) => idx !== index);
                                      handleUpdateNestedField('Requires', 'ItemCost', updatedList.length > 0 ? updatedList : undefined);
                                    }}
                                    className="p-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded border border-red-500/10 transition-colors ml-auto sm:ml-0"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'unidade' && (
                <div className="bg-dark-900/40 p-4 rounded-lg border border-dark-800 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">{t('skill_editor.fields.unit_title')}</h3>
                  <p className="text-xs text-gray-500">
                    {t('skill_editor.fields.unit_subtitle')}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">{t('skill_editor.fields.active_instance')}</label>
                      <LevelArrayEditor
                        label={t('skill_editor.fields.max_unit_instances')}
                        value={selectedSkill.ActiveInstance}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Max"
                        onChange={(val) => handleUpdateField('ActiveInstance', val)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Zap size={64} className="mb-4 opacity-20 text-amber-500" />
            <h3 className="text-xl font-medium text-gray-400">{t('skill_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2">{t('skill_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerConfig.open}
        onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
        type={pickerConfig.type}
        onSelect={(id, name) => {
          if (pickerConfig.type === 'item') {
            const selectedItemObj = Object.values(itemsMap).find((item: any) => item.Id === Number(id));
            const aegisName = selectedItemObj ? selectedItemObj.AegisName : String(name);
            const currentItemCost = [...(selectedSkill.Requires?.ItemCost || [])];
            if (!currentItemCost.some(c => c.Item.toLowerCase() === aegisName.toLowerCase())) {
              currentItemCost.push({ Item: aegisName, Amount: 1 });
              handleUpdateNestedField('Requires', 'ItemCost', currentItemCost);
            }
          }
          setPickerConfig({ ...pickerConfig, open: false });
        }}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        entityLabel={`Skill #${selectedSkill?.Id} — ${selectedSkill?.Description || selectedSkill?.Name || ''}`}
        isDeleting={isDeleting}
        onConfirm={handleDeleteSkill}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      <DivinePrideImporterPanel
        isOpen={showDPPanel}
        onClose={() => setShowDPPanel(false)}
        resourceType="skill"
        onImportSuccess={handleDPImportSuccess}
      />

      {isCreateModalOpen && (
        <CreateSkillModal
          onClose={() => setIsCreateModalOpen(false)}
          onSkillCreated={(newSkill) => {
            setSkills(prev => [newSkill, ...prev]);
            setSelectedSkillId(newSkill.Id);
            setIsCreateModalOpen(false);
            setSourceTab('custom');
            showToast(t('skill_editor.create_success' as any) || t('skill_editor.save_success'), 'success');
          }}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-[999] flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl animate-in fade-in ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-300 border border-emerald-500/40 shadow-emerald-950/50'
              : 'bg-rose-950/95 text-rose-300 border border-rose-500/40 shadow-rose-950/50'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
};

export default SkillEditor;
