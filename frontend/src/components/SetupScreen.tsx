import React, { useState } from 'react';
import axios from 'axios';
import { useLanguageStore } from '../store/useLanguageStore';
import { Database, FolderOpen, Layers, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

interface SetupScreenProps {
  onSetupComplete: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onSetupComplete }) => {
  const t = useLanguageStore(state => state.t);
  const [dbBasePath, setDbBasePath] = useState('');
  const [grf0Path, setGrf0Path] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    <div className="min-h-screen w-full bg-dark-900 flex items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Subtle background glow effect */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl bg-dark-800/90 backdrop-blur-md border border-dark-700/80 rounded-2xl shadow-2xl overflow-hidden relative z-10 transition-all duration-300">
        {/* Header */}
        <div className="p-8 border-b border-dark-700/70 bg-gradient-to-r from-dark-800 to-dark-800/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400 shadow-lg shadow-primary-500/10">
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
          <p className="text-xs text-dark-300 mt-4 leading-relaxed">
            {t('setup_screen.description')}
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
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

          {/* Database Path Field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-300 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary-400" />
              {t('setup_screen.db_base_path_label')}
            </label>
            <input
              type="text"
              value={dbBasePath}
              onChange={(e) => setDbBasePath(e.target.value)}
              placeholder={t('setup_screen.db_base_path_placeholder')}
              disabled={loading || success}
              className="w-full px-4 py-3 bg-dark-900/80 border border-dark-700 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all duration-200"
            />
            <p className="text-[11px] text-dark-400">
              {t('setup_screen.db_base_path_help')}
            </p>
          </div>

          {/* GRF Path Field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary-400" />
              {t('setup_screen.grf_0_label')}
            </label>
            <input
              type="text"
              value={grf0Path}
              onChange={(e) => setGrf0Path(e.target.value)}
              placeholder={t('setup_screen.grf_0_placeholder')}
              disabled={loading || success}
              className="w-full px-4 py-3 bg-dark-900/80 border border-dark-700 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all duration-200"
            />
            <p className="text-[11px] text-dark-400">
              {t('setup_screen.grf_0_help')}
            </p>
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
