import React, { useState } from 'react';
import axios from 'axios';
import { useLanguageStore, Language } from '../store/useLanguageStore';
import {
  Database,
  FolderOpen,
  Layers,
  FileCode,
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Languages,
  ShieldCheck,
} from 'lucide-react';
import { API_URL } from '../config/env';

const API_BASE = API_URL || 'http://127.0.0.1:8000';

interface SetupScreenProps {
  onSetupComplete: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onSetupComplete }) => {
  const language = useLanguageStore(state => state.language);
  const setLanguage = useLanguageStore(state => state.setLanguage);
  const t = useLanguageStore(state => state.t);

  const [dbBasePath, setDbBasePath] = useState('');
  const [grf0Path, setGrf0Path] = useState('');
  const [iteminfoPath, setIteminfoPath] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [serverEncoding, setServerEncoding] = useState('utf-8');
  const [clientEncoding, setClientEncoding] = useState('latin1');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const openBrowseDialog = async (
    type: 'directory' | 'file',
    filters?: { name: string; extensions: string[] }[]
  ): Promise<string | null> => {
    // 1. Electron wrapper
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        if (type === 'directory') {
          return await (window as any).electronAPI.selectDirectory();
        } else {
          return await (window as any).electronAPI.selectFile(filters);
        }
      } catch (err) {
        console.warn('[SetupScreen] Erro no dialog do Electron:', err);
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
        console.warn('[SetupScreen] Erro no dialog do Tauri:', err);
      }
    }

    // 3. Fallback web
    return null;
  };

  const handleBrowseDir = async () => {
    const res = await openBrowseDialog('directory');
    if (res) setDbBasePath(res);
  };

  const handleBrowseGrf = async () => {
    const res = await openBrowseDialog('file', [{ name: 'Ragnarok GRF', extensions: ['grf'] }]);
    if (res) setGrf0Path(res);
  };

  const handleBrowseItemInfo = async () => {
    const res = await openBrowseDialog('file', [{ name: 'LUA / LUB Scripts', extensions: ['lub', 'lua'] }]);
    if (res) setIteminfoPath(res);
  };

  const toggleLanguage = () => {
    const nextLang: Language = language === 'pt-BR' ? 'en-US' : 'pt-BR';
    setLanguage(nextLang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!dbBasePath.trim()) {
      setErrorMsg(t('setup_screen.error_path_required'));
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/setup`, {
        SERVER_DB_BASE_PATH: dbBasePath.trim(),
        GRF_0: grf0Path.trim(),
        ITEMINFO_PATH: iteminfoPath.trim(),
        API_URL: apiUrl.trim(),
        SERVER_ENCODING: serverEncoding,
        CLIENT_ENCODING: clientEncoding,
      });

      setSuccess(true);
      setTimeout(() => {
        onSetupComplete();
      }, 1200);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Erro ao configurar sistema.';
      setErrorMsg(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-dark-900 flex items-center justify-center p-6 relative overflow-y-auto select-none">
      {/* Subtle background glow effects */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-2xl bg-dark-800/95 backdrop-blur-md border border-dark-700/80 rounded-2xl shadow-2xl overflow-hidden relative z-10 transition-all duration-300 my-8">
        {/* Header */}
        <div className="p-7 border-b border-dark-700/70 bg-gradient-to-r from-dark-800 to-dark-800/60 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400 shadow-lg shadow-primary-500/10 shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">
                {t('setup_screen.title')}
              </h1>
              <p className="text-sm text-dark-300 mt-0.5">
                {t('setup_screen.subtitle')}
              </p>
            </div>
          </div>

          {/* Realtime Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-900/80 hover:bg-dark-700 border border-dark-600/80 text-xs font-semibold text-gray-200 transition-all duration-150 shrink-0 shadow-sm"
          >
            <Languages className="w-4 h-4 text-primary-400" />
            <span>{language === 'pt-BR' ? 'Português (BR)' : 'English (US)'}</span>
          </button>
        </div>

        {/* Description Banner */}
        <div className="px-7 py-3.5 bg-dark-900/50 border-b border-dark-700/50 text-xs text-dark-300 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-primary-400 shrink-0" />
          <span>{t('setup_screen.description')}</span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-7 space-y-6">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center gap-3 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              <span>{t('setup_screen.success_toast')}</span>
            </div>
          )}

          {/* 1. Database Path Field (Required) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-300 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary-400" />
              {t('setup_screen.db_base_path_label')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={dbBasePath}
                onChange={(e) => setDbBasePath(e.target.value)}
                placeholder={t('setup_screen.db_base_path_placeholder')}
                disabled={loading || success}
                className="flex-1 px-4 py-2.5 bg-dark-900/80 border border-dark-700 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all duration-200"
              />
              <button
                type="button"
                onClick={handleBrowseDir}
                disabled={loading || success}
                className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-all duration-150 shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{t('setup_screen.browse')}</span>
              </button>
            </div>
            <p className="text-[11px] text-dark-400">
              {t('setup_screen.db_base_path_help')}
            </p>
          </div>

          {/* 2. GRF Path Field (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary-400" />
              {t('setup_screen.grf_0_label')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={grf0Path}
                onChange={(e) => setGrf0Path(e.target.value)}
                placeholder={t('setup_screen.grf_0_placeholder')}
                disabled={loading || success}
                className="flex-1 px-4 py-2.5 bg-dark-900/80 border border-dark-700 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all duration-200"
              />
              <button
                type="button"
                onClick={handleBrowseGrf}
                disabled={loading || success}
                className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-all duration-150 shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{t('setup_screen.browse')}</span>
              </button>
            </div>
            <p className="text-[11px] text-dark-400">
              {t('setup_screen.grf_0_help')}
            </p>
          </div>

          {/* 3. ItemInfo Path Field (Client System/iteminfo.lub) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-300 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary-400" />
              {t('setup_screen.iteminfo_label')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={iteminfoPath}
                onChange={(e) => setIteminfoPath(e.target.value)}
                placeholder={t('setup_screen.iteminfo_placeholder')}
                disabled={loading || success}
                className="flex-1 px-4 py-2.5 bg-dark-900/80 border border-dark-700 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all duration-200"
              />
              <button
                type="button"
                onClick={handleBrowseItemInfo}
                disabled={loading || success}
                className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-all duration-150 shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{t('setup_screen.browse')}</span>
              </button>
            </div>
            <p className="text-[11px] text-dark-400">
              {t('setup_screen.iteminfo_help')}
            </p>
          </div>

          {/* 4. API URL / Key Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-300 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-400" />
              {t('setup_screen.api_url_label')}
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={t('setup_screen.api_url_placeholder')}
              disabled={loading || success}
              className="w-full px-4 py-2.5 bg-dark-900/80 border border-dark-700 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all duration-200"
            />
            <p className="text-[11px] text-dark-400">
              {t('setup_screen.api_url_help')}
            </p>
          </div>

          {/* 5. Encoding Settings Section */}
          <div className="p-4 rounded-xl bg-dark-900/70 border border-dark-700/60 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {t('setup_screen.encoding_title')}
              </h3>
              <p className="text-[11px] text-dark-400 mt-0.5">
                {t('setup_screen.encoding_desc')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-dark-300">
                  {t('setup_screen.server_encoding_label')}
                </label>
                <select
                  value={serverEncoding}
                  onChange={(e) => setServerEncoding(e.target.value)}
                  disabled={loading || success}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary-500 transition-all"
                >
                  <option value="utf-8">UTF-8 (Recomendado rAthena)</option>
                  <option value="latin1">LATIN1 (ISO-8859-1)</option>
                  <option value="cp1252">Windows-1252</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-dark-300">
                  {t('setup_screen.client_encoding_label')}
                </label>
                <select
                  value={clientEncoding}
                  onChange={(e) => setClientEncoding(e.target.value)}
                  disabled={loading || success}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary-500 transition-all"
                >
                  <option value="latin1">LATIN1 (Padrão Oficial RO Client)</option>
                  <option value="cp1252">Windows-1252</option>
                  <option value="utf-8">UTF-8</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none text-white font-semibold text-sm shadow-lg shadow-primary-600/25 flex items-center justify-center gap-2 transition-all duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('setup_screen.saving')}</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('common.success')}</span>
                </>
              ) : (
                <span>{t('setup_screen.save_and_start')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
