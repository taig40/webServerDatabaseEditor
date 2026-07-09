import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import {
  Search, Plus, ShieldAlert, Database, Sparkles, Loader2
} from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';
import MonsterAnimator from '../components/MonsterAnimator';
import MonsterDetail from '../components/MonsterDetail';
import NewMobModal from '../components/NewMobModal';
import { localizeLoadingStatus } from '../utils/i18nHelpers';

type SourceTab = 'rathena' | 'custom';

// Element colour pills for list items
const ELEMENT_COLORS: Record<string, string> = {
  Neutral: 'text-gray-400 bg-gray-500/20',
  Water:   'text-blue-400 bg-blue-500/20',
  Earth:   'text-yellow-700 bg-yellow-700/20',
  Fire:    'text-red-400 bg-red-500/20',
  Wind:    'text-green-400 bg-green-500/20',
  Poison:  'text-purple-400 bg-purple-500/20',
  Holy:    'text-yellow-300 bg-yellow-400/20',
  Dark:    'text-violet-400 bg-violet-500/20',
  Ghost:   'text-slate-400 bg-slate-500/20',
  Undead:  'text-zinc-400 bg-zinc-600/20',
};

const MonsterEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [mobs, setMobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('monster_editor.status.connecting'));
  const [mobsLoaded, setMobsLoaded] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [selectedMobId, setSelectedMobId] = useState<number | null>(null);
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ─── Loading poll ──────────────────────────────────────────────────────────
  useEffect(() => {
    let intervalId: any;

    const checkStatusAndFetch = async () => {
      try {
        const statusRes = await axios.get(`${API_URL}/api/mobs/status`);
        const { is_loading, message, mobs_loaded } = statusRes.data;
        
        setLoadingStatus(localizeLoadingStatus(message, t));
        setMobsLoaded(mobs_loaded);
 
        if (!is_loading && message !== 'Aguardando inicialização...') {
          if (intervalId) clearInterval(intervalId);
          setLoadingStatus(t('loading.loadingMonsters'));
          try {
            const mobsRes = await axios.get(`${API_URL}/api/mobs/?skip=0&limit=50000`);
            setMobs(mobsRes.data.mobs);
            setIsLoading(false);
          } catch (err) {
            console.error('Erro ao baixar monstros:', err);
            setLoadingStatus(t('monster_editor.status.error_final_array'));
          }
        }
      } catch (err) {
        console.error('Erro no polling de status de monstros:', err);
        setLoadingStatus(t('monster_editor.status.offline'));
      }
    };

    checkStatusAndFetch();
    intervalId = setInterval(checkStatusAndFetch, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // ─── Derived lists ─────────────────────────────────────────────────────────
  const rathenaMobs = useMemo(
    () => [...mobs.filter(m => m._source !== 'custom')].sort((a, b) => a.Id - b.Id),
    [mobs]
  );
  const customMobs = useMemo(
    () => [...mobs.filter(m => m._source === 'custom')].sort((a, b) => a.Id - b.Id),
    [mobs]
  );
  const activeMobs = sourceTab === 'rathena' ? rathenaMobs : customMobs;

  const filteredMobs = useMemo(() => {
    if (!searchText) return activeMobs;
    const lower = searchText.toLowerCase();
    return activeMobs.filter(m =>
      String(m.Id).includes(lower) ||
      (m.Name && m.Name.toLowerCase().includes(lower)) ||
      (m.AegisName && m.AegisName.toLowerCase().includes(lower))
    );
  }, [activeMobs, searchText]);

  const selectedMob = useMemo(
    () => (selectedMobId === null ? null : mobs.find(m => m.Id === selectedMobId) || null),
    [mobs, selectedMobId]
  );

  // ─── Save handler ──────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async (
    mobId: number,
    updatedData: any,
    saveMode: 'import' | 'overwrite' = 'import'
  ) => {
    try {
      const payload = { ...updatedData };
      delete payload._source;
      delete payload.Id;

      setMobs(prev => prev.map(m => m.Id === mobId ? { ...m, ...updatedData } : m));

      const res = await axios.put(`${API_URL}/api/mobs/${mobId}?save_mode=${saveMode}`, payload);
      if (res.data) {
        setMobs(prev => prev.map(m => m.Id === mobId ? { ...m, ...res.data } : m));
      }
      console.log(`[webSDE] Mob ${mobId} atualizado com sucesso!`);
      return true;
    } catch (error) {
      console.error('[webSDE] Falha ao salvar mob:', error);
      alert(t('monster_editor.status.save_error'));
      return false;
    }
  }, []);

  // ─── Mob list item ─────────────────────────────────────────────────────────
  const MobListItem = useCallback(({ mob }: { mob: any }) => {
    const isSelected = mob.Id === selectedMobId;
    const element = mob.Element || 'Neutral';
    const elLevel = mob.ElementLevel ?? 1;
    const elClass = ELEMENT_COLORS[element] || 'text-gray-400 bg-gray-500/20';
    const isMvp = mob.Class === 'Boss' || (mob.MvpDrops && mob.MvpDrops.length > 0);

    return (
      <button
        onClick={() => setSelectedMobId(mob.Id)}
        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.03] transition-all duration-150 ${
          isSelected
            ? 'bg-violet-600/20 border-l-2 border-l-violet-500'
            : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
        }`}
      >
        {/* Sprite thumbnail */}
        <div className="w-10 h-10 flex-shrink-0 overflow-hidden rounded-lg bg-dark-900/80 border border-white/5 flex items-center justify-center">
          <MonsterAnimator mobId={mob.Id} mobName={mob.Name || ''} size="sm" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
              {mob.Name || mob.AegisName}
            </span>
            {isMvp && (
              <span className="text-[9px] bg-red-950/80 border border-red-800 text-red-400 px-1.5 rounded-full font-bold shrink-0">
                MVP
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-mono text-gray-600">#{mob.Id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${elClass}`}>
              Lv{elLevel} {element}
            </span>
            <span className="text-[10px] text-gray-600">{mob.Race}</span>
          </div>
        </div>

        {/* Level badge */}
        <div className="text-right shrink-0">
          <div className="text-[10px] text-gray-600 uppercase">Lvl</div>
          <div className={`text-sm font-bold ${isSelected ? 'text-violet-300' : 'text-gray-400'}`}>
            {mob.Level ?? '?'}
          </div>
        </div>
      </button>
    );
  }, [selectedMobId]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-dark-950 overflow-hidden font-sans relative">

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900/90 backdrop-blur-sm">
          <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-6" />
          <h3 className="text-2xl text-white font-semibold mb-2">{t('monster_editor.status.loading_title')}</h3>
          <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
          <div className="bg-dark-800 px-4 py-2 rounded-full border border-white/10">
            <span className="text-violet-400 font-bold text-sm">
              {t('loading.entriesRead', { count: mobsLoaded })}
            </span>
          </div>
        </div>
      )}

      {/* New mob modal */}
      {isModalOpen && (
        <NewMobModal
          onClose={() => setIsModalOpen(false)}
          onMobCreated={(newMob: any) => {
            setMobs(prev => [newMob, ...prev]);
            setSelectedMobId(newMob.Id);
            setIsModalOpen(false);
            setSourceTab('custom');
          }}
        />
      )}

      {/* ── Sidebar ── */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl z-10">

        {/* Sidebar header */}
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <ShieldAlert size={18} className="text-violet-500" />
              {t('monster_editor.title')}
            </h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 rounded transition-colors"
              title={t('monster_editor.new_monster')}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Source tabs */}
          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedMobId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-violet-600/80 text-white shadow-md shadow-violet-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} />
              rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${
                sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'
              }`}>
                {rathenaMobs.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedMobId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} />
              Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${
                sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'
              }`}>
                {customMobs.length.toLocaleString()}
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={t('monster_editor.search_placeholder')}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full bg-dark-900/60 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Count bar */}
        <div className="px-4 py-1.5 text-[10px] text-gray-600 border-b border-white/[0.04]">
          {t('monster_editor.results', { count: filteredMobs.length.toLocaleString() })} / {t('monster_editor.total', { count: activeMobs.length.toLocaleString() })}
        </div>

        {/* Virtual list */}
        <div className="flex-1 overflow-hidden">
          {filteredMobs.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
              <ShieldAlert size={32} className="opacity-20" />
              <span className="text-xs">{t('monster_editor.no_monsters_found')}</span>
            </div>
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              totalCount={filteredMobs.length}
              itemContent={index => <MobListItem mob={filteredMobs[index]} />}
            />
          )}
        </div>
      </div>

      {/* ── Detail Panel ── */}
      <div className="flex-1 overflow-hidden">
        {selectedMob ? (
          <MonsterDetail
            key={selectedMob.Id}
            mob={selectedMob}
            onUpdate={handleUpdate}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-600 gap-3">
            <ShieldAlert size={48} className="opacity-20" />
            <span className="text-lg font-semibold text-gray-500">{t('monster_editor.no_selection.title')}</span>
            <span className="text-sm text-gray-600 max-w-xs">
              {t('monster_editor.no_selection.subtitle')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonsterEditor;
