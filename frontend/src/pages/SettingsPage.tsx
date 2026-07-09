import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Settings, Database, FolderOpen, Server, Globe, RefreshCw, Save,
  Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, XCircle,
  AlertTriangle, Loader2, HardDrive, Layers, ShieldCheck
} from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

const MAX_GRF = 10;

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, subtitle, iconClass = 'text-violet-400', children
}: {
  icon: React.ElementType; title: string; subtitle?: string;
  iconClass?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#16161f] border border-white/5 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-white/5">
        <Icon size={17} className={iconClass} />
        <div>
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-gray-600 text-[11px] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function PathField({
  label, sublabel, value, onChange, placeholder, type = 'dir', ext
}: {
  label: string; sublabel?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  type?: 'dir' | 'file'; ext?: string;
}) {
  const t = useLanguageStore(state => state.t);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const handleBrowse = async () => {
    setIsBrowsing(true);
    try {
      const res = await axios.post(`${API_URL}/api/settings/browse`, {
        type,
        initial: value,
        ext
      });
      if (res.data && res.data.path) {
        onChange(res.data.path);
      }
    } catch (err) {
      console.error('Error browsing path:', err);
    } finally {
      setIsBrowsing(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">{label}</label>
      {sublabel && <p className="text-[11px] text-gray-600 -mt-1">{sublabel}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FolderOpen size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder || t('settings.database.placeholder')}
            className="w-full bg-[#0f0f14] border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-sm text-gray-200 font-mono placeholder-gray-700 focus:outline-none focus:border-violet-500/60 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={handleBrowse}
          disabled={isBrowsing}
          className="px-4 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5"
        >
          {isBrowsing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <FolderOpen size={12} />
          )}
          {t('settings.browse')}
        </button>
      </div>
    </div>
  );
}

// Status badge from /validate endpoint
function StatusBadge({ status }: { status?: { status: string } }) {
  const t = useLanguageStore(state => state.t);
  if (!status) return null;
  if (status.status === 'ok') return <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={11} /> {t('settings.grf.validation.ok')}</span>;
  if (status.status === 'empty') return <span className="flex items-center gap-1 text-[10px] text-gray-600"><XCircle size={11} /> {t('settings.grf.validation.empty')}</span>;
  return <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertTriangle size={11} /> {t('settings.grf.validation.not_found')}</span>;
}

// ── GRF Entry Row ──────────────────────────────────────────────────────────────

interface GRFEntry { priority: number; path: string; }

function GRFRow({
  entry, index, total, onChange, onRemove, onMoveUp, onMoveDown, validationStatus
}: {
  entry: GRFEntry; index: number; total: number;
  onChange: (v: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  validationStatus?: { status: string };
}) {
  const t = useLanguageStore(state => state.t);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const handleBrowse = async () => {
    setIsBrowsing(true);
    try {
      const res = await axios.post(`${API_URL}/api/settings/browse`, {
        type: 'file',
        initial: entry.path,
        ext: 'grf'
      });
      if (res.data && res.data.path) {
        onChange(res.data.path);
      }
    } catch (err) {
      console.error('Error browsing GRF:', err);
    } finally {
      setIsBrowsing(false);
    }
  };

  const priorityColors = [
    'bg-violet-600', 'bg-indigo-600', 'bg-blue-600', 'bg-cyan-600', 'bg-teal-600',
    'bg-green-700', 'bg-yellow-700', 'bg-orange-700', 'bg-red-700', 'bg-gray-700',
  ];
  const priorityLabels = [
    t('settings.grf.priority_max'),
    '', '', '', '', '', '', '', '',
    t('settings.grf.priority_min')
  ];
  const bgColor = priorityColors[entry.priority] || 'bg-gray-700';

  return (
    <div className="flex items-center gap-3 group">
      {/* Priority badge */}
      <div className={`flex-shrink-0 flex flex-col items-center justify-center w-9 h-9 rounded-lg ${bgColor} shadow`}>
        <span className="text-white text-[11px] font-bold leading-none">{entry.priority}</span>
        {priorityLabels[entry.priority] && (
          <span className="text-white/60 text-[8px] leading-none mt-0.5">{priorityLabels[entry.priority]}</span>
        )}
      </div>

      {/* Path input */}
      <div className="flex-1 flex gap-2">
        <div className="relative flex-1">
          <FolderOpen size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={entry.path}
            onChange={e => onChange(e.target.value)}
            placeholder={t('settings.grf.placeholder', { priority: entry.priority })}
            className="w-full bg-[#0f0f14] border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-xs text-gray-200 font-mono placeholder-gray-700 focus:outline-none focus:border-violet-500/60 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={handleBrowse}
          disabled={isBrowsing}
          className="px-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white font-semibold text-xs rounded-xl shadow transition-colors flex items-center gap-1"
        >
          {isBrowsing ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <FolderOpen size={11} />
          )}
          {t('settings.browse')}
        </button>
      </div>

      {/* Validation status */}
      <div className="w-20 flex-shrink-0">
        <StatusBadge status={validationStatus} />
      </div>

      {/* Move / Remove buttons */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition-colors"
        >
          <ChevronUp size={13} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition-colors"
        >
          <ChevronDown size={13} />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-gray-700 hover:text-red-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const { language, setLanguage, t } = useLanguageStore();
  const [serverDbBasePath, setServerDbBasePath] = useState('');
  const [iteminfoPath, setIteminfoPath] = useState('');
  const [grfList, setGrfList] = useState<GRFEntry[]>([]);
  const [grfOverridePath, setGrfOverridePath] = useState('');
  const [corsOrigins, setCorsOrigins] = useState('');
  const [serverEncoding, setServerEncoding] = useState('utf-8');
  const [clientEncoding, setClientEncoding] = useState('euc-kr');
  const [achievementsLuaPath, setAchievementsLuaPath] = useState('');
  const [questsLuaPath, setQuestsLuaPath] = useState('');
  const [encodingOptions, setEncodingOptions] = useState<{ value: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [reloadStatus, setReloadStatus] = useState<null | { reloaded_dbs: string[]; grf_count: number }>(null);
  const [validation, setValidation] = useState<Record<string, { status: string }>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Load current settings
  useEffect(() => {
    setIsLoading(true);
    axios.get(`${API_URL}/api/settings`)
      .then(r => {
        const d = r.data;
        setServerDbBasePath(d.server_db_base_path || '');
        setIteminfoPath(d.iteminfo_path || '');
        setGrfList(d.grf_list || []);
        setGrfOverridePath(d.grf_override_path || '');
        setCorsOrigins(d.cors_origins || '');
        setServerEncoding(d.server_encoding || 'utf-8');
        setClientEncoding(d.client_encoding || 'euc-kr');
        setAchievementsLuaPath(d.achievements_lua_path || '');
        setQuestsLuaPath(d.quests_lua_path || '');
        setEncodingOptions(d.encoding_options || []);
      })
      .catch(() => { })
      .finally(() => setIsLoading(false));
  }, []);

  const validate = useCallback(() => {
    setIsValidating(true);
    axios.get(`${API_URL}/api/settings/validate`)
      .then(r => setValidation(r.data))
      .catch(() => { })
      .finally(() => setIsValidating(false));
  }, []);

  // GRF list helpers
  const addGRF = () => {
    if (grfList.length >= MAX_GRF) return;
    // Find next free priority slot
    const used = new Set(grfList.map(g => g.priority));
    let next = 0;
    while (used.has(next) && next < MAX_GRF) next++;
    setGrfList(prev => [...prev, { priority: next, path: '' }]);
  };

  const removeGRF = (idx: number) => {
    setGrfList(prev => prev.filter((_, i) => i !== idx));
  };

  const updateGRFPath = (idx: number, path: string) => {
    setGrfList(prev => prev.map((g, i) => i === idx ? { ...g, path } : g));
  };

  const moveGRF = (idx: number, dir: -1 | 1) => {
    const arr = [...grfList];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    // Swap priorities
    const tmpPriority = arr[idx].priority;
    arr[idx] = { ...arr[idx], priority: arr[newIdx].priority };
    arr[newIdx] = { ...arr[newIdx], priority: tmpPriority };
    // Swap positions
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setGrfList(arr);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      // Re-number priorities by visual order
      const normalised = grfList
        .filter(g => g.path.trim())
        .map((g, i) => ({ priority: i, path: g.path.trim() }));

      await axios.put(`${API_URL}/api/settings`, {
        server_db_base_path: serverDbBasePath,
        iteminfo_path: iteminfoPath,
        grf_list: normalised,
        grf_override_path: grfOverridePath,
        cors_origins: corsOrigins,
        server_encoding: serverEncoding,
        client_encoding: clientEncoding,
        achievements_lua_path: achievementsLuaPath,
        quests_lua_path: questsLuaPath,
      });
      setGrfList(normalised);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    setReloadStatus(null);
    try {
      const r = await axios.post(`${API_URL}/api/settings/reload`);
      setReloadStatus(r.data);
    } catch {
      setReloadStatus(null);
    } finally {
      setIsReloading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-gray-500">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const sortedGRFs = [...grfList].sort((a, b) => a.priority - b.priority);

  return (
    <div className="flex flex-col h-full bg-[#0f0f14] overflow-y-auto">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Settings size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">{t('settings.title')}</h1>
            <p className="text-gray-500 text-sm">{t('settings.subtitle')}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {/* Validate */}
          <button
            onClick={validate}
            disabled={isValidating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-dark-800/60 text-gray-400 hover:text-white hover:border-white/20 text-sm font-medium transition-all"
          >
            {isValidating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {t('settings.validate_btn')}
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${saveStatus === 'saved'
                ? 'bg-green-600/80 text-white'
                : saveStatus === 'error'
                  ? 'bg-red-700/80 text-white'
                  : 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-900/30'
              }`}
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isSaving ? t('common.saving') : saveStatus === 'saved' ? t('common.success') : t('common.save')}
          </button>

          {/* Reload */}
          <button
            onClick={handleReload}
            disabled={isReloading}
            title={t('settings.reload_cache_subtitle')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-sm font-semibold transition-all"
          >
            {isReloading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('settings.reload_cache')}
          </button>
        </div>
      </div>

      {/* Reload result */}
      {reloadStatus && (
        <div className="mx-8 mt-4 bg-emerald-950/60 border border-emerald-700/40 rounded-xl p-4">
          <p className="text-emerald-400 text-sm font-semibold mb-2">
            {t('settings.reload_success_message', { count: reloadStatus.grf_count })}
          </p>
          <div className="flex flex-wrap gap-2">
            {reloadStatus.reloaded_dbs.map((db, i) => (
              <span key={i} className="text-[11px] bg-emerald-900/40 border border-emerald-700/30 text-emerald-300 px-2 py-0.5 rounded font-mono">
                {db}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-8 py-6 grid grid-cols-1 xl:grid-cols-2 gap-6 content-start">

        {/* ── Server DB ── */}
        <SectionCard icon={Database} title={t('settings.database.title')} subtitle={t('settings.database.subtitle_card')} iconClass="text-violet-400">
          <div className="flex flex-col gap-4">
            <PathField
              label={t('settings.database.label')}
              sublabel={t('settings.database.sublabel')}
              value={serverDbBasePath}
              onChange={setServerDbBasePath}
              placeholder="Ex: C:\rathena\db"
              type="dir"
            />
            {validation['SERVER_DB_BASE_PATH'] && (
              <div className="flex items-center gap-2 text-[11px]">
                <StatusBadge status={validation['SERVER_DB_BASE_PATH']} />
                <span className="text-gray-600">{validation['SERVER_DB_BASE_PATH']?.status === 'ok' ? t('settings.database.found') : t('settings.database.not_found')}</span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Client ── */}
        <SectionCard icon={Server} title={t('settings.client.title')} subtitle={t('settings.client.subtitle_card')} iconClass="text-blue-400">
          <div className="flex flex-col gap-4">
            <PathField
              label={t('settings.client.iteminfo_label')}
              sublabel={t('settings.client.iteminfo_sublabel')}
              value={iteminfoPath}
              onChange={setIteminfoPath}
              placeholder="Ex: C:\kRO\System\LuaFiles514\itemInfo.lua"
              type="file"
              ext="lua"
            />
            {validation['ITEMINFO_PATH'] && (
              <div className="flex items-center gap-2 text-[11px]">
                <StatusBadge status={validation['ITEMINFO_PATH']} />
              </div>
            )}

            <PathField
              label={t('settings.client.achievements_lua_label')}
              sublabel={t('settings.client.achievements_lua_sublabel')}
              value={achievementsLuaPath}
              onChange={setAchievementsLuaPath}
              placeholder={t('settings.client.achievements_lua_placeholder')}
              type="file"
              ext="lua"
            />
            {validation['ACHIEVEMENTS_LUA_PATH'] && (
              <div className="flex items-center gap-2 text-[11px]">
                <StatusBadge status={validation['ACHIEVEMENTS_LUA_PATH']} />
              </div>
            )}

            <PathField
              label={t('settings.client.quests_lua_label')}
              sublabel={t('settings.client.quests_lua_sublabel')}
              value={questsLuaPath}
              onChange={setQuestsLuaPath}
              placeholder={t('settings.client.quests_lua_placeholder')}
              type="file"
              ext="lua"
            />
            {validation['QUESTS_LUA_PATH'] && (
              <div className="flex items-center gap-2 text-[11px]">
                <StatusBadge status={validation['QUESTS_LUA_PATH']} />
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── GRF Files ── */}
        <div className="xl:col-span-2">
          <SectionCard
            icon={HardDrive}
            title={t('settings.grf.title')}
            subtitle={t('settings.grf.subtitle')}
            iconClass="text-orange-400"
          >
            {/* Legend */}
            <div className="flex items-center gap-4 mb-4 text-[11px] text-gray-600">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-violet-600 inline-block" />
                {t('settings.grf.legend_max')}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-gray-700 inline-block" />
                {t('settings.grf.legend_min')}
              </div>
              <div className="flex items-center gap-1.5 ml-2 text-gray-500">
                {t('settings.grf.legend_accepted')}
              </div>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {sortedGRFs.length === 0 ? (
                <div className="text-center py-8 text-gray-700 border border-dashed border-white/5 rounded-xl text-sm">
                  {t('settings.grf.empty')}
                </div>
              ) : (
                sortedGRFs.map((entry, idx) => (
                  <GRFRow
                    key={entry.priority}
                    entry={entry}
                    index={idx}
                    total={sortedGRFs.length}
                    onChange={path => updateGRFPath(grfList.indexOf(entry), path)}
                    onRemove={() => removeGRF(grfList.indexOf(entry))}
                    onMoveUp={() => moveGRF(idx, -1)}
                    onMoveDown={() => moveGRF(idx, 1)}
                    validationStatus={validation[`GRF_${entry.priority}`]}
                  />
                ))
              )}
            </div>

            {grfList.length < MAX_GRF && (
              <button
                onClick={addGRF}
                className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 py-2 px-3 rounded-lg bg-violet-600/10 hover:bg-violet-600/20 border border-violet-600/20 transition-colors"
              >
                <Plus size={13} /> {t('settings.grf.add', { count: grfList.length, max: MAX_GRF })}
              </button>
            )}

            {grfList.length >= MAX_GRF && (
              <p className="text-xs text-amber-500/80 mt-2 flex items-center gap-1.5">
                <AlertTriangle size={12} />
                {t('settings.grf.limit_reached', { max: MAX_GRF })}
              </p>
            )}

            {/* Override path */}
            <div className="mt-5 pt-5 border-t border-white/5">
              <PathField
                label={t('settings.grf.override_label')}
                sublabel={t('settings.grf.override_sublabel')}
                value={grfOverridePath}
                onChange={setGrfOverridePath}
                placeholder={t('settings.grf.override_placeholder')}
                type="dir"
              />
              {validation['GRF_OVERRIDE_PATH'] && (
                <div className="flex items-center gap-2 mt-2 text-[11px]">
                  <StatusBadge status={validation['GRF_OVERRIDE_PATH']} />
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Encoding ── */}
        <div className="xl:col-span-2">
          <SectionCard
            icon={Globe}
            title={t('settings.advanced.encoding_title')}
            subtitle={t('settings.advanced.encoding_subtitle')}
            iconClass="text-cyan-400"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Server encoding */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                  {t('settings.advanced.server_encoding')}
                </label>
                <p className="text-[11px] text-gray-600 -mt-1">
                  {t('settings.advanced.server_encoding_desc')}
                </p>
                <div className="relative mt-0.5">
                  <select
                    value={serverEncoding}
                    onChange={e => setServerEncoding(e.target.value)}
                    className="w-full appearance-none bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/60 transition-colors cursor-pointer pr-8"
                  >
                    {(encodingOptions.length > 0 ? encodingOptions : [
                      { value: 'utf-8', label: '' },
                      { value: 'euc-kr', label: '' },
                      { value: 'cp1252', label: '' },
                      { value: 'latin-1', label: '' },
                    ]).map(opt => {
                      let label = opt.label;
                      if (opt.value === 'utf-8') label = t('settings.advanced.encoding_options.utf8');
                      else if (opt.value === 'euc-kr') label = t('settings.advanced.encoding_options.euckr');
                      else if (opt.value === 'cp1252') label = t('settings.advanced.encoding_options.cp1252');
                      else if (opt.value === 'latin-1') label = t('settings.advanced.encoding_options.latin1');
                      return (
                        <option key={opt.value} value={opt.value}>{label}</option>
                      );
                    })}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">▾</div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono bg-dark-900/60 border border-white/5 px-2 py-0.5 rounded text-violet-300">
                    SERVER_ENCODING={serverEncoding}
                  </span>
                </div>
              </div>

              {/* Client encoding */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                  {t('settings.advanced.client_encoding')}
                </label>
                <p className="text-[11px] text-gray-600 -mt-1">
                  {t('settings.advanced.client_encoding_desc')}
                </p>
                <div className="relative mt-0.5">
                  <select
                    value={clientEncoding}
                    onChange={e => setClientEncoding(e.target.value)}
                    className="w-full appearance-none bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/60 transition-colors cursor-pointer pr-8"
                  >
                    {(encodingOptions.length > 0 ? encodingOptions : [
                      { value: 'utf-8', label: '' },
                      { value: 'euc-kr', label: '' },
                      { value: 'cp1252', label: '' },
                      { value: 'latin-1', label: '' },
                    ]).map(opt => {
                      let label = opt.label;
                      if (opt.value === 'utf-8') label = t('settings.advanced.encoding_options.utf8');
                      else if (opt.value === 'euc-kr') label = t('settings.advanced.encoding_options.euckr');
                      else if (opt.value === 'cp1252') label = t('settings.advanced.encoding_options.cp1252');
                      else if (opt.value === 'latin-1') label = t('settings.advanced.encoding_options.latin1');
                      return (
                        <option key={opt.value} value={opt.value}>{label}</option>
                      );
                    })}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">▾</div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono bg-dark-900/60 border border-white/5 px-2 py-0.5 rounded text-cyan-300">
                    CLIENT_ENCODING={clientEncoding}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Language ── */}
        <div className="xl:col-span-2">
          <SectionCard
            icon={Globe}
            title={t('settings.language.title')}
            subtitle={t('settings.language.subtitle')}
            iconClass="text-emerald-400"
          >
            <div className="flex flex-col gap-1.5 max-w-md">
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                {t('settings.language.title')}
              </label>
              <div className="relative mt-0.5">
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value as any)}
                  className="w-full appearance-none bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/60 transition-colors cursor-pointer pr-8"
                >
                  <option value="pt-BR">{t('settings.language.pt')}</option>
                  <option value="en-US">{t('settings.language.en')}</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">▾</div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Advanced ── */}
        <div className="xl:col-span-2">
          <SectionCard icon={Globe} title={t('settings.advanced.title')} iconClass="text-gray-400">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                {t('settings.advanced.cors_label')}
              </label>
              <p className="text-[11px] text-gray-600 -mt-1">
                {t('settings.advanced.cors_sublabel')}
              </p>
              <input
                type="text"
                value={corsOrigins}
                onChange={e => setCorsOrigins(e.target.value)}
                placeholder="http://localhost:5173, http://127.0.0.1:5173"
                className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 font-mono placeholder-gray-700 focus:outline-none focus:border-violet-500/60 transition-colors"
              />
            </div>
          </SectionCard>
        </div>

      </div>
    </div>
  );
};

export default SettingsPage;
