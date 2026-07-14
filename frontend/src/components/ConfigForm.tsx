import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Database, FolderOpen, Server, Globe, Save, Plus, Trash2,
  ChevronUp, ChevronDown, CheckCircle2, XCircle, AlertTriangle,
  Loader2, HardDrive, Layers, FileCode, Search, ShieldCheck
} from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

const API_BASE = API_URL || 'http://127.0.0.1:8000';
const MAX_GRF = 10;

export interface GRFEntry {
  priority: number;
  path: string;
}

export interface ConfigFormData {
  server_db_base_path: string;
  grf_0: string;
  grf_list: GRFEntry[];
  grf_override_path: string;
  iteminfo_path: string;
  achievements_lua_path: string;
  quests_lua_path: string;
  api_url: string;
  server_encoding: string;
  client_encoding: string;
  cors_origins: string;
  encoding_options: { value: string; label: string }[];
}

export interface ConfigFormProps {
  initialData?: Partial<ConfigFormData>;
  onSubmit: (data: ConfigFormData) => void | Promise<void>;
  buttonText: string;
  isOOBE?: boolean;
  isSaving?: boolean;
  validation?: Record<string, { status: string; path?: string }>;
}

// ── Helpers & Sub-components ──────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, subtitle, iconClass = 'text-violet-400', children
}: {
  icon: React.ElementType; title: string; subtitle?: string;
  iconClass?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#16161f] border border-white/5 rounded-2xl p-6 shadow-xl transition-all">
      <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-white/5">
        <Icon size={17} className={iconClass} />
        <div>
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-gray-500 text-[11px] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status?: { status: string } }) {
  const t = useLanguageStore(state => state.t);
  if (!status) return null;
  if (status.status === 'ok') return <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium"><CheckCircle2 size={11} /> {t('settings.grf.validation.ok') || 'Encontrado'}</span>;
  if (status.status === 'empty') return <span className="flex items-center gap-1 text-[10px] text-gray-500 font-medium"><XCircle size={11} /> {t('settings.grf.validation.empty') || 'Vazio'}</span>;
  return <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium"><AlertTriangle size={11} /> {t('settings.grf.validation.not_found') || 'Não encontrado'}</span>;
}

// Universal Browse Dialog supporting Electron, Tauri, and Web API Fallback
async function openBrowseDialog(
  type: 'directory' | 'file',
  initialPath?: string,
  filters?: { name: string; extensions: string[] }[],
  ext?: string
): Promise<string | null> {
  // 1. Electron wrapper
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    try {
      if (type === 'directory') {
        const res = await (window as any).electronAPI.selectDirectory();
        if (res) return res;
      } else {
        const res = await (window as any).electronAPI.selectFile(filters);
        if (res) return res;
      }
    } catch (err) {
      console.warn('[ConfigForm] Erro no dialog do Electron:', err);
    }
  }

  // 2. Tauri wrapper
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { open } = (window as any).__TAURI__.dialog;
      const selected = await open({
        directory: type === 'directory',
        multiple: false,
        filters: filters,
      });
      if (typeof selected === 'string') return selected;
    } catch (err) {
      console.warn('[ConfigForm] Erro no dialog do Tauri:', err);
    }
  }

  // 3. Fallback Web API (/api/settings/browse)
  try {
    const res = await axios.post(`${API_BASE}/api/settings/browse`, {
      type: type === 'directory' ? 'dir' : 'file',
      initial: initialPath || '',
      ext: ext || filters?.[0]?.extensions?.[0]
    });
    if (res.data && res.data.path) {
      return res.data.path;
    }
  } catch (err) {
    console.error('[ConfigForm] Erro no browse via API Web:', err);
  }

  return null;
}

function PathField({
  label, sublabel, value, onChange, placeholder, type = 'directory', ext, filters, disabled, validationStatus, icon: FieldIcon = FolderOpen
}: {
  label: string; sublabel?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  type?: 'directory' | 'file'; ext?: string;
  filters?: { name: string; extensions: string[] }[];
  disabled?: boolean; validationStatus?: { status: string };
  icon?: React.ElementType;
}) {
  const t = useLanguageStore(state => state.t);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const handleBrowse = async () => {
    setIsBrowsing(true);
    try {
      const selected = await openBrowseDialog(type, value, filters, ext);
      if (selected) {
        onChange(selected);
      }
    } finally {
      setIsBrowsing(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
          <FieldIcon className="w-3.5 h-3.5 text-violet-400" />
          <span>{label}</span>
        </label>
        {validationStatus && <StatusBadge status={validationStatus} />}
      </div>
      {sublabel && <p className="text-[11px] text-gray-500 -mt-0.5">{sublabel}</p>}
      <div className="flex gap-2 mt-0.5">
        <div className="relative flex-1">
          <FolderOpen size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder || ''}
            disabled={disabled}
            className="w-full bg-[#0f0f14] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/30 transition-all disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={handleBrowse}
          disabled={disabled || isBrowsing}
          className="px-4 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:bg-violet-800/60 disabled:pointer-events-none text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center gap-1.5 shrink-0"
        >
          {isBrowsing ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          <span>{t('setup_screen.browse') || t('settings.browse') || 'Procurar'}</span>
        </button>
      </div>
    </div>
  );
}

// ── Main Presenter Component (<ConfigForm />) ──────────────────────────────────

export const ConfigForm: React.FC<ConfigFormProps> = ({
  initialData,
  onSubmit,
  buttonText,
  isOOBE = false,
  isSaving = false,
  validation = {}
}) => {
  const { t } = useLanguageStore();

  // Local Form State
  const [serverDbBasePath, setServerDbBasePath] = useState('');
  const [grf0Path, setGrf0Path] = useState('');
  const [grfList, setGrfList] = useState<GRFEntry[]>([]);
  const [grfOverridePath, setGrfOverridePath] = useState('');
  const [iteminfoPath, setIteminfoPath] = useState('');
  const [achievementsLuaPath, setAchievementsLuaPath] = useState('');
  const [questsLuaPath, setQuestsLuaPath] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [serverEncoding, setServerEncoding] = useState('utf-8');
  const [clientEncoding, setClientEncoding] = useState('latin1');
  const [corsOrigins, setCorsOrigins] = useState('');
  const [encodingOptions, setEncodingOptions] = useState<{ value: string; label: string }[]>([]);

  // Sync initialData with local state when provided/changed
  useEffect(() => {
    if (initialData) {
      if (initialData.server_db_base_path !== undefined) setServerDbBasePath(initialData.server_db_base_path || '');
      if (initialData.grf_0 !== undefined) setGrf0Path(initialData.grf_0 || '');
      if (initialData.grf_list !== undefined) {
        const list = initialData.grf_list || [];
        setGrfList(list);
        if (list.length > 0 && !initialData.grf_0) {
          setGrf0Path(list[0].path || '');
        }
      }
      if (initialData.grf_override_path !== undefined) setGrfOverridePath(initialData.grf_override_path || '');
      if (initialData.iteminfo_path !== undefined) setIteminfoPath(initialData.iteminfo_path || '');
      if (initialData.achievements_lua_path !== undefined) setAchievementsLuaPath(initialData.achievements_lua_path || '');
      if (initialData.quests_lua_path !== undefined) setQuestsLuaPath(initialData.quests_lua_path || '');
      if (initialData.api_url !== undefined) setApiUrl(initialData.api_url || '');
      if (initialData.server_encoding !== undefined) setServerEncoding(initialData.server_encoding || 'utf-8');
      if (initialData.client_encoding !== undefined) setClientEncoding(initialData.client_encoding || 'latin1');
      if (initialData.cors_origins !== undefined) setCorsOrigins(initialData.cors_origins || '');
      if (initialData.encoding_options !== undefined) setEncodingOptions(initialData.encoding_options || []);
    }
  }, [initialData]);

  // GRF List manipulation helpers for Settings mode
  const addGRF = () => {
    if (grfList.length >= MAX_GRF) return;
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
    if (idx === 0) setGrf0Path(path);
  };

  const moveGRF = (idx: number, dir: -1 | 1) => {
    const arr = [...grfList];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    const tmpPriority = arr[idx].priority;
    arr[idx] = { ...arr[idx], priority: arr[newIdx].priority };
    arr[newIdx] = { ...arr[newIdx], priority: tmpPriority };
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setGrfList(arr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalData: ConfigFormData = {
      server_db_base_path: serverDbBasePath.trim(),
      grf_0: grf0Path.trim(),
      grf_list: grfList.map((g, idx) => ({ priority: idx, path: g.path.trim() })),
      grf_override_path: grfOverridePath.trim(),
      iteminfo_path: iteminfoPath.trim(),
      achievements_lua_path: achievementsLuaPath.trim(),
      quests_lua_path: questsLuaPath.trim(),
      api_url: apiUrl.trim(),
      server_encoding: serverEncoding,
      client_encoding: clientEncoding,
      cors_origins: corsOrigins.trim(),
      encoding_options: encodingOptions,
    };

    await onSubmit(finalData);
  };

  const sortedGRFs = [...grfList].sort((a, b) => a.priority - b.priority);

  // ── OOBE Mode Rendering (First-Time Setup / SetupScreen) ──────────────────
  if (isOOBE) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <PathField
          label={t('setup_screen.db_base_path_label') || 'Pasta rAthena Base'}
          sublabel={t('setup_screen.db_base_path_help') || 'Caminho principal do servidor rAthena (onde se encontram db/ e conf/).'}
          value={serverDbBasePath}
          onChange={setServerDbBasePath}
          placeholder={t('setup_screen.db_base_path_placeholder') || 'Ex: C:\\rathena ou /home/user/rathena'}
          type="directory"
          disabled={isSaving}
          icon={Database}
        />

        <PathField
          label={t('setup_screen.grf_0_label') || 'Arquivo GRF Principal (GRF_0)'}
          sublabel={t('setup_screen.grf_0_help') || 'Arquivo GRF primário (DATA.INI / data.grf) para leitura de ícones e sprites.'}
          value={grf0Path}
          onChange={setGrf0Path}
          placeholder={t('setup_screen.grf_0_placeholder') || 'Ex: C:\\Ragnarok\\data.grf'}
          type="file"
          ext="grf"
          filters={[{ name: 'Ragnarok GRF', extensions: ['grf'] }]}
          disabled={isSaving}
          icon={Layers}
        />

        <PathField
          label={t('setup_screen.iteminfo_label') || 'ItemInfo LUB / LUA Script'}
          sublabel={t('setup_screen.iteminfo_help') || 'Caminho para o itemInfo.lua ou itemInfo.lub do seu cliente RO.'}
          value={iteminfoPath}
          onChange={setIteminfoPath}
          placeholder={t('setup_screen.iteminfo_placeholder') || 'Ex: C:\\Ragnarok\\System\\itemInfo.lua'}
          type="file"
          ext="lua"
          filters={[{ name: 'LUA / LUB Scripts', extensions: ['lub', 'lua'] }]}
          disabled={isSaving}
          icon={FileCode}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-violet-400" />
            <span>{t('setup_screen.api_url_label') || 'DivinePride API Key / URL'}</span>
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            placeholder={t('setup_screen.api_url_placeholder') || 'Chave da API ou URL customizada DivinePride'}
            disabled={isSaving}
            className="w-full px-4 py-2.5 bg-[#0f0f14] border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/80 transition-all disabled:opacity-60"
          />
          <p className="text-[11px] text-gray-500">
            {t('setup_screen.api_url_help') || 'Necessário para preenchimento automático de descrições e bônus de itens.'}
          </p>
        </div>

        {/* Encoding Settings */}
        <div className="p-4 rounded-xl bg-[#16161f]/80 border border-white/5 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {t('setup_screen.encoding_title') || 'Codificação de Caracteres (Encoding)'}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {t('setup_screen.encoding_desc') || 'Especifique o encoding dos arquivos para evitar caracteres corrompidos em português ou coreano.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-300">
                {t('setup_screen.server_encoding_label') || 'Encoding do Servidor (rAthena)'}
              </label>
              <select
                value={serverEncoding}
                onChange={e => setServerEncoding(e.target.value)}
                disabled={isSaving}
                className="w-full px-3 py-2 bg-[#0f0f14] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 transition-all"
              >
                <option value="utf-8">UTF-8 (Recomendado rAthena)</option>
                <option value="latin1">LATIN1 (ISO-8859-1)</option>
                <option value="cp1252">Windows-1252</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-300">
                {t('setup_screen.client_encoding_label') || 'Encoding do Cliente (RO Client)'}
              </label>
              <select
                value={clientEncoding}
                onChange={e => setClientEncoding(e.target.value)}
                disabled={isSaving}
                className="w-full px-3 py-2 bg-[#0f0f14] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 transition-all"
              >
                <option value="latin1">LATIN1 (Padrão Oficial RO Client)</option>
                <option value="cp1252">Windows-1252</option>
                <option value="utf-8">UTF-8</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none text-white font-semibold text-sm shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition-all duration-200"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('setup_screen.saving') || 'Salvando configurações...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{buttonText}</span>
              </>
            )}
          </button>
        </div>
      </form>
    );
  }

  // ── Settings Mode Rendering (Inside App / SettingsScreen) ─────────────────
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-2 gap-6 content-start">
      {/* ── Server DB ── */}
      <SectionCard icon={Database} title={t('settings.database.title') || 'Banco de Dados do Servidor'} subtitle={t('settings.database.subtitle_card') || 'Configuração do diretório principal do emulador rAthena'} iconClass="text-violet-400">
        <PathField
          label={t('settings.database.label') || 'Pasta Base do rAthena'}
          sublabel={t('settings.database.sublabel') || 'Caminho contendo as pastas /db e /conf'}
          value={serverDbBasePath}
          onChange={setServerDbBasePath}
          placeholder="Ex: C:\rathena\db"
          type="directory"
          disabled={isSaving}
          validationStatus={validation['SERVER_DB_BASE_PATH']}
          icon={Database}
        />
      </SectionCard>

      {/* ── Client ── */}
      <SectionCard icon={Server} title={t('settings.client.title') || 'Arquivos do Cliente'} subtitle={t('settings.client.subtitle_card') || 'Caminhos de scripts LUA/LUB para extração e pré-visualização de dados'} iconClass="text-blue-400">
        <div className="flex flex-col gap-4">
          <PathField
            label={t('settings.client.iteminfo_label') || 'Caminho do ItemInfo.lua / .lub'}
            sublabel={t('settings.client.iteminfo_sublabel') || 'Arquivo responsável pelos nomes e descrições dos itens no jogo'}
            value={iteminfoPath}
            onChange={setIteminfoPath}
            placeholder="Ex: C:\kRO\System\LuaFiles514\itemInfo.lua"
            type="file"
            ext="lua"
            filters={[{ name: 'LUA / LUB Scripts', extensions: ['lub', 'lua'] }]}
            disabled={isSaving}
            validationStatus={validation['ITEMINFO_PATH']}
            icon={FileCode}
          />

          <PathField
            label={t('settings.client.achievements_lua_label') || 'Caminho do Achievements.lub'}
            sublabel={t('settings.client.achievements_lua_sublabel') || 'Opcional. Preenche títulos e conquistas na pré-visualização'}
            value={achievementsLuaPath}
            onChange={setAchievementsLuaPath}
            placeholder={t('settings.client.achievements_lua_placeholder') || 'Ex: C:\\kRO\\System\\achievements.lub'}
            type="file"
            ext="lua"
            filters={[{ name: 'LUA / LUB Scripts', extensions: ['lub', 'lua'] }]}
            disabled={isSaving}
            validationStatus={validation['ACHIEVEMENTS_LUA_PATH']}
            icon={FileCode}
          />

          <PathField
            label={t('settings.client.quests_lua_label') || 'Caminho do OngoingQuests.lub'}
            sublabel={t('settings.client.quests_lua_sublabel') || 'Opcional. Preenche títulos e resumos das missões'}
            value={questsLuaPath}
            onChange={setQuestsLuaPath}
            placeholder={t('settings.client.quests_lua_placeholder') || 'Ex: C:\\kRO\\System\\OngoingQuests.lub'}
            type="file"
            ext="lua"
            filters={[{ name: 'LUA / LUB Scripts', extensions: ['lub', 'lua'] }]}
            disabled={isSaving}
            validationStatus={validation['QUESTS_LUA_PATH']}
            icon={FileCode}
          />
        </div>
      </SectionCard>

      {/* ── GRF Files ── */}
      <div className="xl:col-span-2">
        <SectionCard
          icon={HardDrive}
          title={t('settings.grf.title') || 'Arquivos GRF do Ragnarok'}
          subtitle={t('settings.grf.subtitle') || 'A ordem de leitura segue a prioridade (0 = maior prioridade). GRFs de patch ou customizados devem ficar acima das GRFs oficiais (data.grf).'}
          iconClass="text-orange-400"
        >
          <div className="flex items-center gap-4 mb-4 text-[11px] text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-violet-600 inline-block" />
              {t('settings.grf.legend_max') || 'Maior Prioridade (lido primeiro)'}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gray-700 inline-block" />
              {t('settings.grf.legend_min') || 'Menor Prioridade (lido por último)'}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 mb-4">
            {sortedGRFs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border border-dashed border-white/10 rounded-xl text-sm">
                {t('settings.grf.empty') || 'Nenhum arquivo GRF configurado. Clique em "Adicionar GRF" abaixo.'}
              </div>
            ) : (
              sortedGRFs.map((entry, idx) => {
                const priorityColors = [
                  'bg-violet-600', 'bg-indigo-600', 'bg-blue-600', 'bg-cyan-600', 'bg-teal-600',
                  'bg-green-700', 'bg-yellow-700', 'bg-orange-700', 'bg-red-700', 'bg-gray-700',
                ];
                const bgColor = priorityColors[entry.priority] || 'bg-gray-700';

                return (
                  <div key={entry.priority} className="flex items-center gap-3 group bg-[#0f0f14]/60 p-2.5 rounded-xl border border-white/5">
                    <div className={`flex-shrink-0 flex flex-col items-center justify-center w-8 h-8 rounded-lg ${bgColor} shadow`}>
                      <span className="text-white text-xs font-bold leading-none">{entry.priority}</span>
                    </div>

                    <div className="flex-1 flex gap-2">
                      <div className="relative flex-1">
                        <Layers size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                          type="text"
                          value={entry.path}
                          onChange={e => updateGRFPath(grfList.indexOf(entry), e.target.value)}
                          placeholder={t('settings.grf.placeholder', { priority: entry.priority }) || `Caminho para GRF #${entry.priority}`}
                          disabled={isSaving}
                          className="w-full bg-[#0f0f14] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500/80 transition-all disabled:opacity-60"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const selected = await openBrowseDialog('file', entry.path, [{ name: 'Ragnarok GRF', extensions: ['grf'] }], 'grf');
                          if (selected) updateGRFPath(grfList.indexOf(entry), selected);
                        }}
                        disabled={isSaving}
                        className="px-3.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
                      >
                        <Search size={12} />
                        <span>{t('settings.browse') || 'Procurar'}</span>
                      </button>
                    </div>

                    <div className="w-24 flex-shrink-0">
                      <StatusBadge status={validation[`GRF_${entry.priority}`]} />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveGRF(idx, -1)}
                        disabled={idx === 0 || isSaving}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGRF(idx, 1)}
                        disabled={idx === sortedGRFs.length - 1 || isSaving}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGRF(grfList.indexOf(entry))}
                        disabled={isSaving}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all ml-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {grfList.length < MAX_GRF && (
            <button
              type="button"
              onClick={addGRF}
              disabled={isSaving}
              className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 py-2.5 px-4 rounded-xl bg-violet-600/10 hover:bg-violet-600/20 border border-violet-600/20 transition-all font-semibold"
            >
              <Plus size={14} />
              <span>{t('settings.grf.add', { count: grfList.length, max: MAX_GRF }) || `Adicionar GRF (${grfList.length}/${MAX_GRF})`}</span>
            </button>
          )}

          <div className="mt-6 pt-5 border-t border-white/5">
            <PathField
              label={t('settings.grf.override_label') || 'Pasta de Override de Sprites/Texturas (DATA/'}
              sublabel={t('settings.grf.override_sublabel') || 'Pasta extraída que tem prioridade máxima sobre todas as GRFs para carregamento de texturas.'}
              value={grfOverridePath}
              onChange={setGrfOverridePath}
              placeholder={t('settings.grf.override_placeholder') || 'Ex: C:\\Ragnarok\\data'}
              type="directory"
              disabled={isSaving}
              validationStatus={validation['GRF_OVERRIDE_PATH']}
              icon={FolderOpen}
            />
          </div>
        </SectionCard>
      </div>

      {/* ── Encoding ── */}
      <div className="xl:col-span-2">
        <SectionCard
          icon={Globe}
          title={t('settings.advanced.encoding_title') || 'Configurações de Codificação de Caracteres (Encoding)'}
          subtitle={t('settings.advanced.encoding_subtitle') || 'Define o encoding utilizado nas operações de leitura/escrita do emulador e arquivos do cliente.'}
          iconClass="text-cyan-400"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                {t('settings.advanced.server_encoding') || 'Encoding do Servidor (.txt / .yml)'}
              </label>
              <p className="text-[11px] text-gray-500 -mt-0.5">
                {t('settings.advanced.server_encoding_desc') || 'Padrão recomendado: UTF-8 para rAthena recente.'}
              </p>
              <select
                value={serverEncoding}
                onChange={e => setServerEncoding(e.target.value)}
                disabled={isSaving}
                className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/80 transition-all cursor-pointer mt-1"
              >
                {(encodingOptions.length > 0 ? encodingOptions : [
                  { value: 'utf-8', label: 'UTF-8 (Padrão Recomendado)' },
                  { value: 'euc-kr', label: 'EUC-KR (Coreano)' },
                  { value: 'cp1252', label: 'Windows-1252 (Ocidental)' },
                  { value: 'latin-1', label: 'Latin-1 (ISO-8859-1)' },
                ]).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                {t('settings.advanced.client_encoding') || 'Encoding do Cliente (.lub / .lua / GRF)'}
              </label>
              <p className="text-[11px] text-gray-500 -mt-0.5">
                {t('settings.advanced.client_encoding_desc') || 'Padrão do cliente RO: LATIN1 ou EUC-KR.'}
              </p>
              <select
                value={clientEncoding}
                onChange={e => setClientEncoding(e.target.value)}
                disabled={isSaving}
                className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500/80 transition-all cursor-pointer mt-1"
              >
                {(encodingOptions.length > 0 ? encodingOptions : [
                  { value: 'utf-8', label: 'UTF-8' },
                  { value: 'euc-kr', label: 'EUC-KR (Coreano kRO)' },
                  { value: 'cp1252', label: 'Windows-1252' },
                  { value: 'latin-1', label: 'Latin-1 (Padrão Oficial RO Client)' },
                ]).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── DivinePride Integration ── */}
      <div className="xl:col-span-2">
        <SectionCard
          icon={Globe}
          title={t('divinepride.settings_title') || 'Integração DivinePride'}
          subtitle={t('divinepride.settings_subtitle') || 'Chave de API para preenchimento automático de informações e sprites oficiais de itens.'}
          iconClass="text-amber-400"
        >
          <div className="flex flex-col gap-1.5 max-w-xl">
            <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
              {t('divinepride.api_key_label') || 'API Key DivinePride'}
            </label>
            <input
              type="password"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder={t('divinepride.api_key_placeholder') || 'Insira sua chave de API aqui'}
              disabled={isSaving}
              className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500/80 transition-all"
            />
          </div>
        </SectionCard>
      </div>

      {/* ── Advanced CORS ── */}
      <div className="xl:col-span-2">
        <SectionCard icon={Server} title={t('settings.advanced.title') || 'Configurações Avançadas de Servidor'} iconClass="text-gray-400">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
              {t('settings.advanced.cors_label') || 'CORS Origins Customizados'}
            </label>
            <p className="text-[11px] text-gray-500 -mt-0.5">
              {t('settings.advanced.cors_sublabel') || 'Lista separada por vírgulas de origens permitidas para acessar a API do editor.'}
            </p>
            <input
              type="text"
              value={corsOrigins}
              onChange={e => setCorsOrigins(e.target.value)}
              placeholder="http://localhost:5173, http://127.0.0.1:5173"
              disabled={isSaving}
              className="w-full bg-[#0f0f14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500/80 transition-all"
            />
          </div>
        </SectionCard>
      </div>

      {/* Main Save Action Bar */}
      <div className="xl:col-span-2 flex justify-end pt-2 pb-8">
        <button
          type="submit"
          disabled={isSaving}
          className="px-8 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-50 text-white font-semibold text-sm shadow-xl shadow-violet-600/30 flex items-center gap-2 transition-all duration-200"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{buttonText}</span>
        </button>
      </div>
    </form>
  );
};

export default ConfigForm;
