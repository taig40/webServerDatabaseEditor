import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Save, Upload, Shield, Heart, Sword, Star, Award, Zap,
  ChevronRight, AlertCircle, Plus, Trash2, RefreshCw, Loader2, Brain,
  Search, X, DownloadCloud
} from 'lucide-react';
import { API_URL } from '../config/env';
import MonsterAnimator from './MonsterAnimator';
import { useLanguageStore } from '../store/useLanguageStore';
import { DivinePrideImportButton } from './DivinePrideImportButton';

// ─── Element & Race definitions ───────────────────────────────────────────────

const ELEMENTS = ['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Dark', 'Ghost', 'Undead'];
const ELEMENT_COLORS: Record<string, string> = {
  Neutral: 'text-gray-400', Water: 'text-blue-400', Earth: 'text-yellow-700',
  Fire: 'text-red-400', Wind: 'text-green-400', Poison: 'text-purple-400',
  Holy: 'text-yellow-300', Dark: 'text-violet-400', Ghost: 'text-slate-400',
  Undead: 'text-zinc-500',
};
const ELEMENT_BG: Record<string, string> = {
  Neutral: 'bg-gray-500/20', Water: 'bg-blue-500/20', Earth: 'bg-yellow-700/20',
  Fire: 'bg-red-500/20', Wind: 'bg-green-500/20', Poison: 'bg-purple-500/20',
  Holy: 'bg-yellow-400/20', Dark: 'bg-violet-500/20', Ghost: 'bg-slate-500/20',
  Undead: 'bg-zinc-600/20',
};
const RACES = ['Formless', 'Undead', 'Brute', 'Plant', 'Insect', 'Fish', 'Demon', 'Demihuman', 'Angel', 'Dragon'];
const SIZES = ['Small', 'Medium', 'Large'];

const AI_MODES = [
  'CanMove', 'Looter', 'Aggressive', 'Assist',
  'CastSensorIdle', 'NoRandomWalk', 'NoCast', 'CanAttack',
  'CastSensorChase', 'ChangeChase', 'Angry', 'ChangeTargetMelee',
  'ChangeTargetChase', 'TargetWeak', 'RandomTarget', 'IgnoreMelee',
  'IgnoreMagic', 'IgnoreRanged', 'Mvp', 'IgnoreMisc',
  'KnockBackImmune', 'TeleportBlock', 'FixedItemDrop', 'Detector',
  'StatusImmune', 'SkillImmune',
];

const AI_BASE_TYPES = [
  '01', '02', '03', '04', '05', '06', '07', '08',
  '09', '10', '11', '12', '13', '17', '19', '20',
  '21', '24', '25', '26', '27'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{label}</label>
      {children}
    </div>
  );
}

function NumInput({
  value, onChange, min, className = ''
}: { value: number | undefined; onChange: (v: number) => void; min?: number; className?: string }) {
  return (
    <input
      type="number"
      min={min}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={`w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors ${className}`}
    />
  );
}

function Select({
  value, onChange, options, className = ''
}: { value: string; onChange: (v: string) => void; options: string[]; className?: string }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors ${className}`}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function SectionCard({ icon: Icon, title, iconClass = 'text-violet-400', children }: {
  icon: React.ElementType; title: string; iconClass?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl">
      <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-3">
        <Icon size={16} className={iconClass} />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const getStateBadgeClass = (state: string) => {
  const s = String(state || '').toLowerCase();
  if (s === 'attack') return 'bg-red-500/15 border border-red-500/30 text-red-300';
  if (s === 'chase') return 'bg-amber-500/15 border border-amber-500/30 text-amber-300';
  if (s === 'idle') return 'bg-blue-500/15 border border-blue-500/30 text-blue-300';
  if (s === 'any') return 'bg-purple-500/15 border border-purple-500/30 text-purple-300';
  return 'bg-dark-800 border border-white/10 text-gray-300';
};

const getConditionBadgeClass = (cond: string) => {
  const c = String(cond || '').toLowerCase();
  if (c === 'always') return 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300';
  if (c.includes('hp')) return 'bg-rose-500/15 border border-rose-500/30 text-rose-300';
  if (c.includes('cast')) return 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300';
  return 'bg-slate-700/40 border border-white/10 text-gray-300';
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface MonsterDetailProps {
  mob: any;
  onUpdate: (mobId: number, data: any, saveMode?: 'import' | 'overwrite') => Promise<boolean | void>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const MonsterDetail: React.FC<MonsterDetailProps> = ({ mob, onUpdate }) => {
  const t = useLanguageStore(state => state.t);
  const [local, setLocal] = useState<any>(mob);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [spriteKey, setSpriteKey] = useState(0);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'drops' | 'ai' | 'skills'>('status');
  const [showSpriteModal, setShowSpriteModal] = useState(false);
  const [sprFile, setSprFile] = useState<File | null>(null);
  const [actFile, setActFile] = useState<File | null>(null);
  const [isUploadingSprite, setIsUploadingSprite] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const sprInputRef = useRef<HTMLInputElement>(null);
  const actInputRef = useRef<HTMLInputElement>(null);

  // Skill lookup cache & Add Modal State
  const [allSkillsMap, setAllSkillsMap] = useState<Record<number, { Name: string; Description?: string }>>({});
  const [allSkillsList, setAllSkillsList] = useState<any[]>([]);
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [newSkillForm, setNewSkillForm] = useState({
    skill_id: 1,
    skill_lv: 1,
    rate: 100,
    state: 'idle',
    condition_type: 'always',
    condition_value: 0,
    cast_time: 0,
    delay: 5000,
    cancelable: false,
    target: 'target',
  });

  const [dpMessage, setDpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDPImportSuccess = (mappedData: any) => {
    setLocal(prev => ({
      ...prev,
      ...mappedData,
      Id: mob.Id
    }));
    if (mappedData.MobSkills && Array.isArray(mappedData.MobSkills)) {
      setSkills(mappedData.MobSkills);
    }
    setDpMessage({ type: 'success', text: t('divinepride.import_success') });
    setTimeout(() => setDpMessage(null), 6000);
  };

  // Sync when mob changes
  useEffect(() => {
    setLocal(mob);
    setSpriteKey(k => k + 1);
    setSkills(mob.MobSkills || []);
    setActiveTab('status');
  }, [mob.Id, mob]);

  // Load skills on tab switch if needed + load global skills cache
  useEffect(() => {
    if (activeTab !== 'skills') return;
    if (!local.MobSkills && skills.length === 0) {
      setSkillsLoading(true);
      axios.get(`${API_URL}/api/mobs/${mob.Id}/skills`)
        .then(r => setSkills(r.data.skills || []))
        .catch(() => setSkills([]))
        .finally(() => setSkillsLoading(false));
    }
    if (Object.keys(allSkillsMap).length === 0) {
      axios.get(`${API_URL}/api/skills/?limit=50000`)
        .then(r => {
          const list = r.data.skills || [];
          setAllSkillsList(list);
          const map: Record<number, { Name: string; Description?: string }> = {};
          list.forEach((s: any) => {
            map[s.Id] = { Name: s.Name || s.Description || `Skill #${s.Id}` };
          });
          setAllSkillsMap(map);
        })
        .catch(() => {});
    }
  }, [activeTab, mob.Id]);

  const set = (field: string, val: any) =>
    setLocal((prev: any) => ({ ...prev, [field]: val }));

  const setModes = (key: string, val: boolean) =>
    setLocal((prev: any) => ({
      ...prev,
      Modes: { ...(prev.Modes || {}), [key]: val }
    }));

  const activeMobSkills = local.MobSkills || skills || [];

  const handleAddSkill = () => {
    const updated = [
      ...activeMobSkills,
      {
        mob_id: mob.Id,
        dummy_name: local.AegisName || local.Name || String(mob.Id),
        skill_id: Number(newSkillForm.skill_id),
        skill_lv: Number(newSkillForm.skill_lv),
        rate: Math.min(10000, Math.max(0, Math.round(Number(newSkillForm.rate) * 100))),
        state: newSkillForm.state,
        condition_type: newSkillForm.condition_type,
        condition_value: Number(newSkillForm.condition_value),
        cast_time: Number(newSkillForm.cast_time),
        delay: Number(newSkillForm.delay),
        cancelable: Boolean(newSkillForm.cancelable),
        target: newSkillForm.target,
      }
    ];
    set('MobSkills', updated);
    setSkills(updated);
    setShowAddSkillModal(false);
  };

  const handleDeleteSkill = (index: number) => {
    const updated = activeMobSkills.filter((_: any, idx: number) => idx !== index);
    set('MobSkills', updated);
    setSkills(updated);
  };

  const isModified = JSON.stringify(local) !== JSON.stringify(mob);

  const handleSave = () => {
    if (!isModified) return;
    if (mob._source === 'rathena') {
      setShowSaveModal(true);
    } else {
      executeSave('import');
    }
  };

  const executeSave = async (mode: 'import' | 'overwrite') => {
    setIsSaving(true);
    setShowSaveModal(false);
    try {
      const payload = { ...local };
      delete payload._source;
      delete payload.Id;
      await onUpdate(mob.Id, payload, mode);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSpriteUpload = async () => {
    if (!sprFile || !actFile) {
      setUploadError(t('monster_detail.sprite.error_select_both'));
      return;
    }
    setIsUploadingSprite(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('spr_file', sprFile);
      formData.append('act_file', actFile);
      await axios.post(`${API_URL}/api/mobs/${mob.Id}/sprite/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSpriteKey(k => k + 1);
      setShowSpriteModal(false);
      setSprFile(null);
      setActFile(null);
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail || err.message || t('common.error'));
    } finally {
      setIsUploadingSprite(false);
    }
  };

  const element = local.Element || 'Neutral';
  const elementLevel = local.ElementLevel ?? 1;
  const isMvp = local.Class === 'Boss' || (local.MvpDrops && local.MvpDrops.length > 0);

  // ─── Drops helpers ────────────────────────────────────────────────────────

  const updateDrop = (type: 'Drops' | 'MvpDrops', idx: number, field: string, val: any) => {
    const arr = [...(local[type] || [])];
    arr[idx] = { ...arr[idx], [field]: field === 'Rate' ? Math.round(Number(val) * 100) : val };
    set(type, arr);
  };

  const addDrop = (type: 'Drops' | 'MvpDrops') => {
    const arr = [...(local[type] || []), { Item: '', Rate: 100 }];
    set(type, arr);
  };

  const removeDrop = (type: 'Drops' | 'MvpDrops', idx: number) => {
    const arr = (local[type] || []).filter((_: any, i: number) => i !== idx);
    set(type, arr);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-dark-900 text-gray-200">

      {/* Save Mode Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-800 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-2">{t('monster_detail.save_modal.title')}</h3>
            <p className="text-gray-400 text-sm mb-5">
              {t('monster_detail.save_modal.body')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => executeSave('import')}
                className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
              >
                {t('monster_detail.save_modal.create_copy')}
              </button>
              <button
                onClick={() => executeSave('overwrite')}
                className="px-4 py-2.5 rounded-lg bg-red-900/60 hover:bg-red-900 border border-red-700/40 text-red-300 font-semibold text-sm transition-colors"
              >
                {t('monster_detail.save_modal.overwrite')}
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-start justify-between p-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent gap-4">
        <div className="flex items-start gap-5 flex-1 min-w-0">

          {/* Sprite + upload overlay */}
          <div className="relative group flex-shrink-0">
            <MonsterAnimator
              mobId={mob.Id}
              mobName={local.Name}
              size="md"
              spriteKey={spriteKey}
            />
            {/* Upload overlay on hover */}
            <button
              onClick={() => { setShowSpriteModal(true); setUploadError(null); }}
              className="absolute inset-0 bg-black/70 rounded-lg flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer backdrop-blur-[1px]"
              title={t('monster_detail.sprite.hover_title')}
            >
              <Upload size={22} className="text-white drop-shadow" />
              <span className="text-white text-[10px] font-bold tracking-wide">{t('monster_detail.sprite.change')}</span>
              <span className="text-white/60 text-[9px]">ACT + SPR</span>
            </button>
          </div>

          {/* SPR+ACT Upload Modal */}
          {showSpriteModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-dark-800 border border-white/10 rounded-2xl p-6 w-[420px] shadow-2xl">
                <h3 className="text-white font-bold text-base mb-1 flex items-center gap-2">
                  <Upload size={16} className="text-violet-400" />
                  {t('monster_detail.sprite.upload_modal.title')}
                </h3>
                <p className="text-gray-500 text-xs mb-5">
                  {t('monster_detail.sprite.upload_modal.subtitle', { name: local.AegisName })}
                </p>

                {/* SPR file picker */}
                <div
                  onClick={() => sprInputRef.current?.click()}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all mb-3 ${
                    sprFile
                      ? 'border-violet-500/60 bg-violet-600/10'
                      : 'border-white/10 hover:border-white/20 bg-dark-900/60'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    sprFile ? 'bg-violet-600 text-white' : 'bg-dark-700 text-gray-500'
                  }`}>
                    SPR
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-300">
                      {sprFile ? sprFile.name : t('monster_detail.sprite.upload_modal.select_spr')}
                    </div>
                    {sprFile && (
                      <div className="text-[10px] text-gray-500">{(sprFile.size / 1024).toFixed(1)} KB</div>
                    )}
                  </div>
                  {sprFile
                    ? <span className="text-green-400 text-lg">✓</span>
                    : <Upload size={14} className="text-gray-600" />
                  }
                </div>
                <input
                  ref={sprInputRef}
                  type="file"
                  accept=".spr"
                  className="hidden"
                  onChange={e => { setSprFile(e.target.files?.[0] || null); e.target.value = ''; }}
                />

                {/* ACT file picker */}
                <div
                  onClick={() => actInputRef.current?.click()}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all mb-4 ${
                    actFile
                      ? 'border-cyan-500/60 bg-cyan-600/10'
                      : 'border-white/10 hover:border-white/20 bg-dark-900/60'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    actFile ? 'bg-cyan-600 text-white' : 'bg-dark-700 text-gray-500'
                  }`}>
                    ACT
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-300">
                      {actFile ? actFile.name : t('monster_detail.sprite.upload_modal.select_act')}
                    </div>
                    {actFile && (
                      <div className="text-[10px] text-gray-500">{(actFile.size / 1024).toFixed(1)} KB</div>
                    )}
                  </div>
                  {actFile
                    ? <span className="text-green-400 text-lg">✓</span>
                    : <Upload size={14} className="text-gray-600" />
                  }
                </div>
                <input
                  ref={actInputRef}
                  type="file"
                  accept=".act"
                  className="hidden"
                  onChange={e => { setActFile(e.target.files?.[0] || null); e.target.value = ''; }}
                />

                {uploadError && (
                  <div className="text-red-400 text-xs bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2 mb-3">
                    {uploadError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleSpriteUpload}
                    disabled={!sprFile || !actFile || isUploadingSprite}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isUploadingSprite
                      ? <><Loader2 size={14} className="animate-spin" /> {t('common.saving')}</>
                      : <><Upload size={14} /> {t('monster_detail.sprite.upload_modal.upload_button')}</>}
                  </button>
                  <button
                    onClick={() => { setShowSpriteModal(false); setSprFile(null); setActFile(null); setUploadError(null); }}
                    className="px-4 py-2.5 text-gray-400 hover:text-white bg-dark-900/60 border border-white/5 rounded-xl text-sm transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Name / meta */}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-2xl font-bold text-white truncate">{local.Name || t('monster_detail.unnamed')}</h2>
              {isMvp && (
                <span className="text-[10px] bg-red-950/80 border border-red-800 text-red-400 px-2 py-0.5 rounded-full font-bold shrink-0">
                  MVP
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-gray-400">
              <span className="bg-dark-800 px-2 py-0.5 rounded border border-white/10 flex items-center gap-2">
                <span>ID: <span className="text-violet-400">{mob.Id}</span></span>
                <DivinePrideImportButton
                  resourceType="monster"
                  resourceId={mob.Id}
                  onImportSuccess={handleDPImportSuccess}
                />
              </span>
              <span className="bg-dark-800 px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                Aegis: 
                <input
                  type="text"
                  value={local.AegisName || local.SpriteName || ''}
                  onChange={e => {
                    set('AegisName', e.target.value);
                    set('SpriteName', e.target.value);
                  }}
                  className="bg-transparent text-blue-400 font-mono focus:outline-none focus:border-b focus:border-blue-500/50 w-32"
                  placeholder="AegisName"
                />
              </span>
              <span className={`px-2 py-0.5 rounded border border-white/10 font-semibold ${ELEMENT_BG[element]} ${ELEMENT_COLORS[element]}`}>
                Lv{elementLevel} {element}
              </span>
              <span className="bg-dark-800 px-2 py-0.5 rounded border border-white/10 text-gray-300">
                {local.Race}
              </span>
              <span className="bg-dark-800 px-2 py-0.5 rounded border border-white/10 text-gray-300">
                {local.Size}
              </span>
            </div>
            {dpMessage && (
              <div className={`mt-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
                dpMessage.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                  : 'bg-red-950/80 border-red-700/60 text-red-300'
              }`}>
                <AlertCircle size={14} />
                <span>{dpMessage.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 shrink-0">
          {isModified && (
            <span className="text-amber-400 text-xs font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 animate-pulse">
              ● {t('monster_detail.unsaved')}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!isModified || isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg ${
              isModified
                ? 'bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-violet-600/20'
                : 'bg-dark-800 text-gray-500 border border-dark-700 cursor-not-allowed'
            }`}
          >
            <Save size={15} />
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-white/5 px-4 pt-2 gap-1 text-xs shrink-0">
        {(['status', 'drops', 'ai', 'skills'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t font-semibold capitalize transition-all ${
              activeTab === tab
                ? 'bg-dark-800 border-t-2 border-violet-500 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tab === 'status' && t('monster_detail.tabs.status')}
            {tab === 'drops' && t('monster_detail.tabs.drops')}
            {tab === 'ai' && t('monster_detail.tabs.ai')}
            {tab === 'skills' && t('monster_detail.tabs.skills')}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 p-4 overflow-y-auto">

        {/* ── STATUS ── */}
        {activeTab === 'status' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Identity */}
            <SectionCard icon={Star} title={t('monster_detail.sections.identity')} iconClass="text-yellow-400">
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label={t('monster_detail.fields.name')}>
                  <input
                    type="text"
                    value={local.Name || ''}
                    onChange={e => set('Name', e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors"
                  />
                </FieldRow>
                <FieldRow label="AegisName">
                  <input
                    type="text"
                    value={local.AegisName || ''}
                    onChange={e => set('AegisName', e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors"
                  />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.race')}>
                  <Select value={local.Race || 'Formless'} onChange={v => set('Race', v)} options={RACES} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.size')}>
                  <Select value={local.Size || 'Medium'} onChange={v => set('Size', v)} options={SIZES} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.element')}>
                  <Select value={local.Element || 'Neutral'} onChange={v => set('Element', v)} options={ELEMENTS} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.element_level')}>
                  <NumInput value={elementLevel} onChange={v => set('ElementLevel', Math.max(1, Math.min(4, v)))} min={1} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.class')}>
                  <Select
                    value={local.Class || 'Normal'}
                    onChange={v => set('Class', v)}
                    options={['Normal', 'Boss', 'Guardian', 'Battlefield', 'Event']}
                  />
                </FieldRow>
                <FieldRow label="Level">
                  <NumInput value={local.Level} onChange={v => set('Level', v)} min={1} />
                </FieldRow>
              </div>
            </SectionCard>

            {/* Combat Stats */}
            <SectionCard icon={Sword} title={t('monster_detail.sections.combat')} iconClass="text-orange-400">
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="HP">
                  <NumInput value={local.Hp} onChange={v => set('Hp', v)} min={0} />
                </FieldRow>
                <FieldRow label="SP">
                  <NumInput value={local.Sp} onChange={v => set('Sp', v)} min={0} />
                </FieldRow>
                <FieldRow label="ATK Min">
                  <NumInput value={local.Attack} onChange={v => set('Attack', v)} min={0} />
                </FieldRow>
                <FieldRow label="ATK Max">
                  <NumInput value={local.Attack2} onChange={v => set('Attack2', v)} min={0} />
                </FieldRow>
                <FieldRow label="DEF">
                  <NumInput value={local.Defense} onChange={v => set('Defense', v)} min={0} />
                </FieldRow>
                <FieldRow label="MDEF">
                  <NumInput value={local.MagicDefense} onChange={v => set('MagicDefense', v)} min={0} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.res_phys')}>
                  <NumInput value={local.Resistance} onChange={v => set('Resistance', v)} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.res_magic')}>
                  <NumInput value={local.MagicResistance} onChange={v => set('MagicResistance', v)} />
                </FieldRow>
              </div>
            </SectionCard>

            {/* Attributes */}
            <SectionCard icon={Shield} title={t('monster_detail.sections.attributes')} iconClass="text-blue-400">
              <div className="grid grid-cols-3 gap-3">
                {['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'].map(attr => (
                  <div key={attr} className="bg-dark-900/80 rounded-lg border border-white/5 p-2 text-center">
                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">{attr}</div>
                    <input
                      type="number"
                      value={local[attr] ?? 1}
                      onChange={e => set(attr, Number(e.target.value))}
                      className="bg-transparent text-white font-bold w-full text-center text-sm focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Ranges & Speed */}
            <SectionCard icon={Zap} title={t('monster_detail.sections.ranges_speed')} iconClass="text-cyan-400">
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label={t('monster_detail.fields.atk_range')}>
                  <NumInput value={local.AttackRange} onChange={v => set('AttackRange', v)} min={0} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.skill_range')}>
                  <NumInput value={local.SkillRange} onChange={v => set('SkillRange', v)} min={0} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.chase_range')}>
                  <NumInput value={local.ChaseRange} onChange={v => set('ChaseRange', v)} min={0} />
                </FieldRow>
                <FieldRow label={t('monster_detail.fields.walk_speed')}>
                  <NumInput value={local.WalkSpeed} onChange={v => set('WalkSpeed', v)} min={0} />
                </FieldRow>
                <FieldRow label="Attack Delay">
                  <NumInput value={local.AttackDelay} onChange={v => set('AttackDelay', v)} min={0} />
                </FieldRow>
                <FieldRow label="Attack Motion">
                  <NumInput value={local.AttackMotion} onChange={v => set('AttackMotion', v)} min={0} />
                </FieldRow>
                <FieldRow label="Damage Motion">
                  <NumInput value={local.DamageMotion} onChange={v => set('DamageMotion', v)} min={0} />
                </FieldRow>
                <FieldRow label="Damage Taken %">
                  <NumInput value={local.DamageTaken} onChange={v => set('DamageTaken', v)} min={0} />
                </FieldRow>
              </div>
            </SectionCard>

            {/* Experience */}
            <SectionCard icon={Award} title={t('monster_detail.sections.experience')} iconClass="text-emerald-400">
              <div className="grid grid-cols-3 gap-3">
                <FieldRow label="Base EXP">
                  <NumInput value={local.BaseExp} onChange={v => set('BaseExp', v)} min={0} />
                </FieldRow>
                <FieldRow label="Job EXP">
                  <NumInput value={local.JobExp} onChange={v => set('JobExp', v)} min={0} />
                </FieldRow>
                <FieldRow label="MVP EXP">
                  <NumInput value={local.MvpExp} onChange={v => set('MvpExp', v)} min={0} />
                </FieldRow>
              </div>
            </SectionCard>

          </div>
        )}

        {/* ── DROPS ── */}
        {activeTab === 'drops' && (
          <div className="flex flex-col gap-4">

            {/* Normal Drops */}
            <SectionCard icon={Sword} title={t('monster_detail.sections.normal_drops')} iconClass="text-green-400">
              <div className="flex flex-col gap-1.5">
                {/* Header */}
                <div className="grid grid-cols-[1fr_120px_32px] gap-2 text-[10px] text-gray-500 uppercase tracking-widest px-1 mb-1">
                  <span>{t('monster_detail.drops.item')}</span>
                  <span className="text-right">{t('monster_detail.drops.rate')}</span>
                  <span />
                </div>
                {(local.Drops || []).length === 0 && (
                  <div className="text-xs text-gray-600 italic text-center py-4 bg-dark-900/30 rounded-lg border border-white/5">
                    {t('monster_detail.drops.no_drops')}
                  </div>
                )}
                {(local.Drops || []).map((drop: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center">
                    <input
                      type="text"
                      value={drop.Item || ''}
                      onChange={e => updateDrop('Drops', idx, 'Item', e.target.value)}
                      placeholder={t('monster_detail.drops.placeholder_item')}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={drop.Rate !== undefined ? (drop.Rate / 100).toFixed(2) : ''}
                      onChange={e => updateDrop('Drops', idx, 'Rate', e.target.value)}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-green-400 font-bold focus:border-violet-500 focus:outline-none text-right"
                    />
                    <button
                      onClick={() => removeDrop('Drops', idx)}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addDrop('Drops')}
                  className="mt-1 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 py-1.5 px-3 rounded-lg bg-violet-600/10 hover:bg-violet-600/20 border border-violet-600/20 transition-colors self-start"
                >
                  <Plus size={13} /> {t('monster_detail.drops.add_drop')}
                </button>
              </div>
            </SectionCard>

            {/* MVP Drops */}
            <SectionCard icon={Award} title={t('monster_detail.sections.mvp_drops')} iconClass="text-red-400">
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-[1fr_120px_32px] gap-2 text-[10px] text-gray-500 uppercase tracking-widest px-1 mb-1">
                  <span>{t('monster_detail.drops.item')}</span>
                  <span className="text-right">{t('monster_detail.drops.rate')}</span>
                  <span />
                </div>
                {(local.MvpDrops || []).length === 0 && (
                  <div className="text-xs text-gray-600 italic text-center py-4 bg-dark-900/30 rounded-lg border border-white/5">
                    {t('monster_detail.drops.no_mvp_drops')}
                  </div>
                )}
                {(local.MvpDrops || []).map((drop: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center">
                    <input
                      type="text"
                      value={drop.Item || ''}
                      onChange={e => updateDrop('MvpDrops', idx, 'Item', e.target.value)}
                      placeholder={t('monster_detail.drops.placeholder_item')}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={drop.Rate !== undefined ? (drop.Rate / 100).toFixed(2) : ''}
                      onChange={e => updateDrop('MvpDrops', idx, 'Rate', e.target.value)}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-yellow-400 font-bold focus:border-violet-500 focus:outline-none text-right"
                    />
                    <button
                      onClick={() => removeDrop('MvpDrops', idx)}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addDrop('MvpDrops')}
                  className="mt-1 flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 py-1.5 px-3 rounded-lg bg-red-600/10 hover:bg-red-600/20 border border-red-600/20 transition-colors self-start"
                >
                  <Plus size={13} /> {t('monster_detail.drops.add_mvp_drop')}
                </button>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── AI / BEHAVIOR SETTINGS ── */}
        {activeTab === 'ai' && (
          <div className="flex flex-col gap-4">
            {/* Base AI Section */}
            <SectionCard icon={Brain} title={t('monster_detail.ai.base_title')} iconClass="text-fuchsia-400">
              <p className="text-xs text-gray-400 mb-3">{t('monster_detail.ai.base_subtitle')}</p>
              <div className="max-w-md">
                <select
                  value={local.Ai || '01'}
                  onChange={e => set('Ai', e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-all"
                >
                  {AI_BASE_TYPES.map(typeCode => (
                    <option key={typeCode} value={typeCode}>
                      {`${typeCode} - ${t((`monster_detail.ai.types.${typeCode}`) as any) || 'Engine Default'}`}
                    </option>
                  ))}
                </select>
              </div>
            </SectionCard>

            {/* Additional Modes Section */}
            <SectionCard icon={Brain} title={t('monster_detail.ai.modes_title')} iconClass="text-fuchsia-400">
              <p className="text-xs text-gray-400 mb-4">{t('monster_detail.ai.modes_subtitle')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AI_MODES.map(modeKey => {
                  const active = Boolean(local.Modes?.[modeKey] || local.Modes?.[modeKey.toLowerCase()]);
                  return (
                    <button
                      key={modeKey}
                      type="button"
                      onClick={() => setModes(modeKey, !active)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        active
                          ? 'bg-violet-600/20 border-violet-500/50 text-violet-300 shadow-inner shadow-violet-900/20'
                          : 'bg-dark-900/60 border-white/5 text-gray-500 hover:border-white/10 hover:text-gray-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-violet-400 animate-pulse' : 'bg-gray-700'}`} />
                      {modeKey}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-600 mt-4 italic">
                {t('monster_detail.ai.subtitle')}
              </p>
            </SectionCard>
          </div>
        )}

        {/* ── SKILLS ── */}
        {activeTab === 'skills' && (
          <SectionCard icon={Zap} title={t('monster_detail.skills.title')} iconClass="text-cyan-400">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs text-gray-400">
                {activeMobSkills.length} {t('monster_detail.skills.title')}
              </span>
              <button
                onClick={() => setShowAddSkillModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-xs font-semibold transition-all shadow-sm"
              >
                <Plus size={14} />
                {t('monster_detail.skills.add_skill')}
              </button>
            </div>

            {skillsLoading ? (
              <div className="flex items-center justify-center py-8 gap-3 text-gray-500">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">{t('monster_detail.skills.loading')}</span>
              </div>
            ) : activeMobSkills.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm italic flex flex-col items-center gap-3">
                <span>{t('monster_detail.skills.no_skills')}</span>
                <button
                  onClick={() => setShowAddSkillModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/40 text-violet-300 hover:bg-violet-600/40 text-xs font-semibold"
                >
                  <Plus size={14} />
                  {t('monster_detail.skills.add_skill')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-x-auto">
                {/* Header */}
                <div className="grid grid-cols-[60px_1.8fr_60px_80px_100px_1.4fr_36px] gap-2 text-[10px] text-gray-400 uppercase tracking-widest px-3 py-1 font-semibold">
                  <span>{t('monster_detail.skills.skill_id')}</span>
                  <span>{t('monster_detail.skills.skill_name')}</span>
                  <span className="text-center">{t('monster_detail.skills.level')}</span>
                  <span className="text-center">{t('monster_detail.skills.rate')}</span>
                  <span>{t('monster_detail.skills.state')}</span>
                  <span>{t('monster_detail.skills.condition')}</span>
                  <span />
                </div>
                {activeMobSkills.map((skill: any, idx: number) => {
                  const skillInfo = allSkillsMap[skill.skill_id];
                  const displayName = skillInfo?.Name || `Skill #${skill.skill_id}`;
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[60px_1.8fr_60px_80px_100px_1.4fr_36px] gap-2 items-center bg-dark-900/70 border border-white/5 rounded-xl px-3 py-2.5 hover:border-violet-500/30 transition-all text-xs"
                    >
                      <span className="text-violet-400 font-mono font-bold">#{skill.skill_id}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Zap size={13} className="text-cyan-400 flex-shrink-0" />
                        <span className="text-gray-200 font-medium truncate" title={displayName}>
                          {displayName}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">
                          Lv.{skill.skill_lv}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${
                          skill.rate >= 5000 ? 'bg-green-500/20 border border-green-500/30 text-green-300' :
                          skill.rate >= 1000 ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300' :
                          'bg-dark-800 border border-white/10 text-gray-400'
                        }`}>
                          {Number(((skill.rate ?? 0) / 100).toFixed(2))}%
                        </span>
                      </div>
                      <div>
                        <span className={`px-2 py-0.5 rounded-full uppercase text-[10px] font-bold ${getStateBadgeClass(skill.state)}`}>
                          {skill.state}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold truncate ${getConditionBadgeClass(skill.condition_type)}`}>
                          {skill.condition_type}
                          {skill.condition_value ? ` (${skill.condition_value})` : ''}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleDeleteSkill(idx)}
                          title={t('monster_detail.skills.delete_skill')}
                          className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-gray-500 mt-3 italic">
                  {t('monster_detail.skills.footer_tip')}
                </p>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── ADD SKILL MODAL ── */}
        {showAddSkillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-dark-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">{t('monster_detail.skills.modal_title')}</h3>
                </div>
                <button
                  onClick={() => setShowAddSkillModal(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
                {/* Search / Select Skill */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    {t('monster_detail.skills.select_skill')}
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={skillSearchQuery}
                      onChange={e => setSkillSearchQuery(e.target.value)}
                      placeholder={t('monster_detail.skills.search_placeholder')}
                      className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  {skillSearchQuery.trim() && (
                    <div className="max-h-36 overflow-y-auto bg-dark-800 border border-white/10 rounded-xl divide-y divide-white/5 mt-1 shadow-lg">
                      {allSkillsList
                        .filter(s => {
                          const q = skillSearchQuery.toLowerCase();
                          return String(s.Id).includes(q) || (s.Name || '').toLowerCase().includes(q) || (s.Description || '').toLowerCase().includes(q);
                        })
                        .slice(0, 15)
                        .map(s => (
                          <button
                            key={s.Id}
                            onClick={() => {
                              setNewSkillForm(f => ({ ...f, skill_id: s.Id }));
                              setSkillSearchQuery(`${s.Id} - ${s.Name || s.Description || ''}`);
                            }}
                            className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors"
                          >
                            <span className="text-white font-medium truncate">{s.Name || s.Description}</span>
                            <span className="text-violet-400 font-mono text-[11px]">#{s.Id}</span>
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-gray-400">{t('monster_detail.skills.skill_id')}:</span>
                    <input
                      type="number"
                      value={newSkillForm.skill_id}
                      onChange={e => setNewSkillForm(f => ({ ...f, skill_id: Number(e.target.value) }))}
                      className="w-24 px-2 py-1 bg-dark-800 border border-white/10 rounded text-xs text-violet-300 font-mono"
                    />
                  </div>
                </div>

                {/* Level and Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.level')}</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={newSkillForm.skill_lv}
                      onChange={e => setNewSkillForm(f => ({ ...f, skill_lv: Number(e.target.value) }))}
                      className="px-3 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.rate')}</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={newSkillForm.rate}
                      onChange={e => setNewSkillForm(f => ({ ...f, rate: Number(e.target.value) }))}
                      className="px-3 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>

                {/* State and Condition Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.state')}</label>
                    <select
                      value={newSkillForm.state}
                      onChange={e => setNewSkillForm(f => ({ ...f, state: e.target.value }))}
                      className="px-3 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    >
                      <option value="idle">idle</option>
                      <option value="attack">attack</option>
                      <option value="chase">chase</option>
                      <option value="any">any</option>
                      <option value="walk">walk</option>
                      <option value="dead">dead</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.condition_type')}</label>
                    <select
                      value={newSkillForm.condition_type}
                      onChange={e => setNewSkillForm(f => ({ ...f, condition_type: e.target.value }))}
                      className="px-3 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    >
                      <option value="always">always</option>
                      <option value="myhpltmaxrate">myhpltmaxrate</option>
                      <option value="myhpgtmaxrate">myhpgtmaxrate</option>
                      <option value="castsensor">castsensor</option>
                      <option value="friendhpltmaxrate">friendhpltmaxrate</option>
                      <option value="statuson">statuson</option>
                    </select>
                  </div>
                </div>

                {/* Condition Value, Cast Time, Delay */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.condition_value')}</label>
                    <input
                      type="number"
                      value={newSkillForm.condition_value}
                      onChange={e => setNewSkillForm(f => ({ ...f, condition_value: Number(e.target.value) }))}
                      className="px-2 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.cast_time')}</label>
                    <input
                      type="number"
                      value={newSkillForm.cast_time}
                      onChange={e => setNewSkillForm(f => ({ ...f, cast_time: Number(e.target.value) }))}
                      className="px-2 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">{t('monster_detail.skills.delay')}</label>
                    <input
                      type="number"
                      value={newSkillForm.delay}
                      onChange={e => setNewSkillForm(f => ({ ...f, delay: Number(e.target.value) }))}
                      className="px-2 py-1.5 bg-dark-800 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10 bg-dark-800/50">
                <button
                  onClick={() => setShowAddSkillModal(false)}
                  className="px-4 py-2 rounded-xl border border-white/10 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {t('monster_detail.skills.cancel')}
                </button>
                <button
                  onClick={handleAddSkill}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-dark-900 font-bold text-xs transition-colors shadow-lg shadow-cyan-500/20"
                >
                  {t('monster_detail.skills.confirm_add')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default MonsterDetail;
