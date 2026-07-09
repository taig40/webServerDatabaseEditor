import React, { useEffect, useState } from 'react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { Database, Sparkles } from 'lucide-react';

interface GlobalLoadingOverlayProps {
  file?: string;
  progress?: number;
  forceShow?: boolean;
}

export const GlobalLoadingOverlay: React.FC<GlobalLoadingOverlayProps> = ({
  file: propFile,
  progress: propProgress,
  forceShow = false,
}) => {
  const t = useLanguageStore(state => state.t);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalProgress, setInternalProgress] = useState(0.0);
  const [internalDatabase, setInternalDatabase] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (forceShow) return; // Se for controlado externamente pelo App.tsx

    let es: EventSource | null = null;
    const connectSSE = () => {
      es = new EventSource(`${API_URL}/api/system/load-progress`);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const active = Boolean(data.is_loading);
          setInternalLoading(active);
          if (typeof data.progress === 'number') {
            setInternalProgress(data.progress);
          }
          if (data.database) {
            setInternalDatabase(data.database);
          }
          if (data.status) {
            setStatusMsg(data.status);
          }
        } catch (e) {
          console.error('[GlobalLoadingOverlay] Erro ao processar evento SSE:', e);
        }
      };
    };

    connectSSE();
    return () => {
      if (es) es.close();
    };
  }, [forceShow]);

  const displayProgress = propProgress !== undefined ? propProgress : internalProgress;
  const displayFile = propFile !== undefined ? propFile : internalDatabase;
  const show = forceShow || internalLoading;

  if (!show && displayProgress >= 100.0) {
    return null;
  }
  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-dark-950/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative flex flex-col items-center justify-center p-8 max-w-md w-full mx-4 rounded-2xl bg-[#12121e]/90 border border-violet-500/20 shadow-2xl shadow-violet-950/50">
        
        {/* Animated Glow Top */}
        <div className="absolute -top-12 w-24 h-24 bg-violet-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Icon */}
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-indigo-600/20 border border-violet-500/30 flex items-center justify-center mb-6 shadow-inner">
          <Database className="w-8 h-8 text-violet-400 animate-pulse" />
          <Sparkles className="w-4 h-4 text-emerald-400 absolute -top-1 -right-1 animate-bounce" />
        </div>

        {/* Titles */}
        <h2 className="text-xl font-bold text-white tracking-wide text-center mb-2">
          {t('global_loading.title')}
        </h2>
        <p className="text-xs text-gray-400 text-center mb-6 leading-relaxed">
          {t('global_loading.subtitle')}
        </p>

        {/* Current Database & Percentage Info */}
        <div className="w-full flex items-center justify-between text-xs font-mono mb-2">
          <span className="text-violet-300 truncate max-w-[65%]">
            {displayFile
              ? t('loading.file', { file: displayFile })
              : (statusMsg || t('loading.connecting'))}
          </span>
          <span className="text-emerald-400 font-bold">
            {t('global_loading.progress', { percent: displayProgress.toFixed(1) })}
          </span>
        </div>

        {/* Smooth Progress Bar */}
        <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden border border-white/10 p-0.5 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-sm"
            style={{ width: `${Math.min(100, Math.max(2, displayProgress))}%` }}
          />
        </div>

        {/* Secondary Status info */}
        {statusMsg && (
          <p className="text-[11px] text-gray-500 font-mono mt-3 text-center truncate w-full">
            {statusMsg}
          </p>
        )}
      </div>
    </div>
  );
};

export default GlobalLoadingOverlay;
