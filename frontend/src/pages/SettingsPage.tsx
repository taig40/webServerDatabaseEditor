import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Settings, RefreshCw, ShieldCheck, Loader2
} from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { getDivinePrideApiKey, setDivinePrideApiKey } from '../utils/divinePride';
import { toast, useToastStore } from '../store/useToastStore';
import { ConfigForm, ConfigFormData } from '../components/ConfigForm';

const API_BASE = API_URL || 'http://127.0.0.1:8000';

export const SettingsScreen: React.FC = () => {
  const { language, setLanguage, t } = useLanguageStore();
  const [currentConfig, setCurrentConfig] = useState<ConfigFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadStatus, setReloadStatus] = useState<null | { reloaded_dbs: string[]; grf_count: number }>(null);
  const [validation, setValidation] = useState<Record<string, { status: string; path?: string }>>({});
  const [isValidating, setIsValidating] = useState(false);

  const loadSettings = useCallback(() => {
    setIsLoading(true);
    axios.get(`${API_BASE}/api/settings`)
      .then(r => {
        const d = r.data;
        setCurrentConfig({
          server_db_base_path: d.server_db_base_path || '',
          iteminfo_path: d.iteminfo_path || '',
          grf_list: d.grf_list || [],
          grf_0: d.grf_list?.[0]?.path || '',
          grf_override_path: d.grf_override_path || '',
          cors_origins: d.cors_origins || '',
          server_encoding: d.server_encoding || 'utf-8',
          client_encoding: d.client_encoding || 'euc-kr',
          achievements_lua_path: d.achievements_lua_path || '',
          quests_lua_path: d.quests_lua_path || '',
          api_url: getDivinePrideApiKey() || d.divine_pride_api_key || '',
          encoding_options: d.encoding_options || [],
        });
      })
      .catch(err => {
        console.error('[SettingsScreen] Erro ao carregar configurações:', err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const validate = useCallback(() => {
    setIsValidating(true);
    axios.get(`${API_BASE}/api/settings/validate`)
      .then(r => setValidation(r.data))
      .catch(err => {
        console.error('[SettingsScreen] Erro ao validar paths:', err);
      })
      .finally(() => setIsValidating(false));
  }, []);

  const handleSettingsUpdate = async (data: ConfigFormData) => {
    setIsSaving(true);
    try {
      const normalised = (data.grf_list || [])
        .filter(g => g.path.trim())
        .map((g, i) => ({ priority: i, path: g.path.trim() }));

      await axios.put(`${API_BASE}/api/settings`, {
        server_db_base_path: data.server_db_base_path,
        iteminfo_path: data.iteminfo_path,
        grf_list: normalised,
        grf_override_path: data.grf_override_path || '',
        cors_origins: data.cors_origins || '',
        server_encoding: data.server_encoding,
        client_encoding: data.client_encoding,
        achievements_lua_path: data.achievements_lua_path || '',
        quests_lua_path: data.quests_lua_path || '',
      });

      if (data.api_url !== undefined) {
        setDivinePrideApiKey(data.api_url);
      }

      setCurrentConfig({
        ...data,
        grf_list: normalised,
      });

      toast.success(t('settings.updated_success') || 'Configurações atualizadas com sucesso!');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Erro ao atualizar configurações.';
      toast.error(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    setReloadStatus(null);
    try {
      const r = await axios.post(`${API_BASE}/api/settings/reload`);
      setReloadStatus(r.data);
      toast.success(t('settings.reload_success') || 'Cache e bancos de dados recarregados.');
    } catch (err: any) {
      setReloadStatus(null);
      toast.error(t('settings.reload_error') || 'Erro ao recarregar cache.');
    } finally {
      setIsReloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-gray-500">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{t('common.loading') || 'Carregando configurações...'}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f14] overflow-y-auto">
      {/* Top Header Bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Settings size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">{t('settings.title') || 'Configurações da Aplicação'}</h1>
            <p className="text-gray-500 text-sm">{t('settings.subtitle') || 'Gerencie caminhos, arquivos GRF e preferências globais'}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Language Switcher */}
          <div className="relative flex items-center bg-dark-800/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-300">
            <span className="text-gray-500 mr-2 uppercase font-semibold">{t('settings.language.title') || 'Idioma'}:</span>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as any)}
              className="bg-transparent border-none text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="pt-BR" className="bg-dark-800">Português (BR)</option>
              <option value="en-US" className="bg-dark-800">English (US)</option>
            </select>
          </div>

          {/* Validate Button */}
          <button
            type="button"
            onClick={validate}
            disabled={isValidating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-dark-800/60 text-gray-400 hover:text-white hover:border-white/20 text-sm font-medium transition-all"
          >
            {isValidating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            <span>{t('settings.validate_btn') || 'Validar Caminhos'}</span>
          </button>

          {/* Reload Cache Button */}
          <button
            type="button"
            onClick={handleReload}
            disabled={isReloading}
            title={t('settings.reload_cache_subtitle') || 'Recarregar GRF e cache do servidor'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-sm font-semibold transition-all"
          >
            {isReloading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>{t('settings.reload_cache') || 'Recarregar Cache'}</span>
          </button>
        </div>
      </div>

      {/* Reload Result Alert */}
      {reloadStatus && (
        <div className="mx-8 mt-4 bg-emerald-950/60 border border-emerald-700/40 rounded-xl p-4 animate-fade-in">
          <p className="text-emerald-400 text-sm font-semibold mb-2">
            {t('settings.reload_success_message', { count: reloadStatus.grf_count }) || `Cache recarregado com sucesso (${reloadStatus.grf_count} GRFs ativas).`}
          </p>
          <div className="flex flex-wrap gap-2">
            {reloadStatus.reloaded_dbs?.map((db, i) => (
              <span key={i} className="text-[11px] bg-emerald-900/40 border border-emerald-700/30 text-emerald-300 px-2 py-0.5 rounded font-mono">
                {db}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Presenter Component */}
      <div className="flex-1 px-8 py-6">
        <ConfigForm
          initialData={currentConfig || undefined}
          buttonText={t('settings.save_btn') || 'Atualizar Configurações'}
          isOOBE={false}
          isSaving={isSaving}
          validation={validation}
          onSubmit={handleSettingsUpdate}
        />
      </div>
    </div>
  );
};

export default SettingsScreen;
export { SettingsScreen as SettingsPage };
