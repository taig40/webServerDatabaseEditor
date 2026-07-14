import React, { useState } from 'react';
import axios from 'axios';
import { useLanguageStore, Language } from '../store/useLanguageStore';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Languages,
  ShieldCheck,
} from 'lucide-react';
import { API_URL } from '../config/env';
import { ConfigForm, ConfigFormData } from './ConfigForm';

const API_BASE = API_URL || 'http://127.0.0.1:8000';

interface SetupScreenProps {
  onSetupComplete: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onSetupComplete }) => {
  const { language, setLanguage, t } = useLanguageStore();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleLanguage = () => {
    const nextLang: Language = language === 'pt-BR' ? 'en-US' : 'pt-BR';
    setLanguage(nextLang);
  };

  const handleOOBESubmit = async (data: ConfigFormData) => {
    setErrorMsg(null);

    if (!data.server_db_base_path.trim()) {
      setErrorMsg(t('setup_screen.error_path_required') || 'O caminho da pasta rAthena é obrigatório.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/setup`, {
        SERVER_DB_BASE_PATH: data.server_db_base_path.trim(),
        GRF_0: (data.grf_0 || (data.grf_list?.[0]?.path ?? '')).trim(),
        ITEMINFO_PATH: data.iteminfo_path.trim(),
        API_URL: (data.api_url || '').trim(),
        SERVER_ENCODING: data.server_encoding,
        CLIENT_ENCODING: data.client_encoding,
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

        {/* Form Container */}
        <div className="p-7 space-y-6">
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

          <ConfigForm
            isOOBE={true}
            buttonText={t('setup_screen.save_and_start') || 'Salvar e Iniciar'}
            isSaving={loading || success}
            onSubmit={handleOOBESubmit}
          />
        </div>
      </div>
    </div>
  );
};
