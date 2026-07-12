import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Settings } from 'lucide-react';
import { API_URL, getSSEUrl } from './config/env';
import Layout, { type ModuleId } from './components/Layout';
import { useLanguageStore } from './store/useLanguageStore';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import ItemEditor from './pages/ItemEditor';
import MonsterEditor from './pages/MonsterEditor';
import SkillEditor from './pages/SkillEditor';
import ComboEditor from './pages/ComboEditor';
import QuestEditor from './pages/QuestEditor';
import PetEditor from './pages/PetEditor';
import ClientItemEditor from './pages/ClientItemEditor';
import AchievementEditor from './pages/AchievementEditor';
import SettingsPage from './pages/SettingsPage';
import RandomOptionsEditor from './pages/RandomOptionsEditor';
import SizeFixMatrix from './pages/SizeFixMatrix';
import ConstantsEditor from './pages/ConstantsEditor';
import JobDatabaseEditor from './pages/JobDatabaseEditor';
import ExperienceTablesEditor from './pages/ExperienceTablesEditor';
import SkillTreeEditor from './pages/SkillTreeEditor';
import MapEngine from './pages/MapEngine';

type ActiveView = ModuleId | 'settings';

interface EncodingErrorPayload {
  error_code: string;
  message: string;
  suggestion: string;
}

function App() {
  const t = useLanguageStore(state => state.t);
  const [activeView, setActiveView] = useState<ActiveView>('items');
  const [encodingError, setEncodingError] = useState<EncodingErrorPayload | null>(null);

  const [isCacheReady, setIsCacheReady] = useState(false);
  const [currentLoadingFile, setCurrentLoadingFile] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const es = new EventSource(getSSEUrl('/api/system/initialize-cache'));

    es.onopen = () => {
      setConnectionError(false);
      setStatusMessage(t('global_loading.readingFiles'));
    };

    es.onmessage = (event) => {
      try {
        setConnectionError(false);
        const data = JSON.parse(event.data);
        if (data.status === 'complete') {
          es.close();
          setIsCacheReady(true);
        } else if (data.status === 'loading') {
          if (data.file) setCurrentLoadingFile(data.file);
          if (typeof data.progress === 'number') setLoadingProgress(data.progress);
          setStatusMessage(t('global_loading.readingFiles'));
        }
      } catch (e) {
        console.error('[App] Erro ao processar evento SSE de inicialização:', e);
      }
    };

    es.onerror = (err) => {
      console.error('[App] Erro de conexão com SSE /api/system/initialize-cache:', err);
      setConnectionError(true);
      setStatusMessage(t('global_loading.connectionFailed'));
      es.close();
    };

    return () => {
      es.close();
    };
  }, [t]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.data && error.response.data.detail) {
          const detail = error.response.data.detail;
          if (detail && typeof detail === 'object' && detail.error_code === 'ENCODING_MISMATCH') {
            setEncodingError(detail as EncodingErrorPayload);
          }
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  const renderContent = () => {
    switch (activeView) {
      case 'items': return <ItemEditor />;
      case 'mobs': return <MonsterEditor />;
      case 'skills': return <SkillEditor />;
      case 'item_combos': return <ComboEditor />;
      case 'server_quests': return <QuestEditor />;
      case 'pets': return <PetEditor />;
      case 'client_items': return <ClientItemEditor />;
      case 'server_achievements': return <AchievementEditor />;
      case 'random_options': return <RandomOptionsEditor />;
      case 'size_fix_editor': return <SizeFixMatrix />;
      case 'constants': return <ConstantsEditor />;
      case 'job_database': return <JobDatabaseEditor />;
      case 'exp_tables': return <ExperienceTablesEditor />;
      case 'skill_tree': return <SkillTreeEditor />;
      case 'map_engine': return <MapEngine />;
      case 'settings': return <SettingsPage />;
      default: return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
          <span className="text-5xl">🚧</span>
          <span className="text-lg font-medium">{t('app.under_development')}</span>
          <span className="text-sm">{t('app.coming_soon_details')}</span>
        </div>
      );
    }
  };

  if (!isCacheReady) {
    return (
      <GlobalLoadingOverlay
        forceShow={true}
        file={currentLoadingFile}
        progress={loadingProgress}
        statusMsg={statusMessage}
        isError={connectionError}
      />
    );
  }

  return (
    <>
      <Layout
        activeView={activeView}
        onViewChange={(v: ModuleId) => setActiveView(v)}
        onSettingsClick={() => setActiveView('settings')}
      >
        {renderContent()}
      </Layout>

      {/* Encoding Mismatch Warning Dialog */}
      {encodingError && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f0f16] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={24} className="text-amber-500 animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">
                  {t('components.encoding_mismatch.title')}
                </h2>
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  ERROR: {encodingError.error_code}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 py-2">
              <div className="bg-dark-950 border border-white/5 p-3 rounded-xl text-sm text-gray-300 font-mono leading-relaxed break-words">
                {encodingError.message}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                {encodingError.suggestion || t('components.encoding_mismatch.suggestion')}
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEncodingError(null)}
                className="flex-1 px-4 py-2.5 bg-dark-800 hover:bg-dark-700 text-gray-400 hover:text-white text-sm font-semibold rounded-xl border border-white/5 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  setEncodingError(null);
                  setActiveView('settings');
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-violet-900/30 transition-colors"
              >
                <Settings size={14} />
                {t('components.encoding_mismatch.go_to_settings')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
