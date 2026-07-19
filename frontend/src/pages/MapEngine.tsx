/**
 * MapEngine.tsx — Game design and editing workspace for map drops and custom map spawns.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { ReferencePicker } from '../components/ReferencePicker';
import MonsterAnimator from '../components/MonsterAnimator';
import { MapSpawnsTab } from '../components/MapSpawns/MapSpawnsTab';
import {
  Map,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  Search,
  Code2,
  Zap,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  AlertCircle,
  Skull,
  Package,
  Terminal,
  FileText,
  Globe,
  Target,
} from 'lucide-react';

/** Represents a single item drop configured inside a map drops entry. */
interface DropEntry {
  Index: number;
  Item: string;
  Rate: number;
  RandomOptionGroup?: string | null;
}

interface SpecificDropEntry {
  Monster: string;
  Drops: DropEntry[];
}

interface MapEntry {
  Map: string;
  GlobalDrops: DropEntry[];
  SpecificDrops: SpecificDropEntry[];
}

interface SpawnForm {
  map: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  monsterAegis: string;
  monsterName: string;
  monsterId: number;
  amount: number;
  respawn: number;
}

type AlertMsg = { text: string; type: 'success' | 'error' } | null;

/**
 * Generates exact tab-separated custom spawn string formatted for rAthena map configuration.
 */
const buildSpawnSnippet = (form: SpawnForm): string => {
  const delay2 = 0;
  return `${form.map},${form.x},${form.y},${form.rx},${form.ry}\tmonster\t${form.monsterAegis || 'Unknown'}\t${form.monsterId},${form.amount},${form.respawn},${delay2}`;
};

/** Calculates next available sequence index for drop entries. */
const nextIndex = (drops: DropEntry[]): number =>
  drops.length === 0 ? 0 : Math.max(...drops.map(d => d.Index)) + 1;

/** Renders a configurable drop table row with item picker, drop rate, and random option assignments. */
const DropRow: React.FC<{
  drop: DropEntry;
  optionNames: string[];
  onChangeItem: () => void;
  onChangeRate: (val: number) => void;
  onChangeROG: (val: string) => void;
  onRemove: () => void;
  t: (k: any) => string;
}> = ({ drop, optionNames, onChangeItem, onChangeRate, onChangeROG, onRemove, t }) => (
  <div className="grid grid-cols-12 gap-2 items-center bg-gray-950 p-2 rounded-lg border border-gray-800/60">
    <div className="col-span-1 flex justify-center">
      <span className="text-xs font-mono text-gray-500">#{drop.Index}</span>
    </div>
    <div className="col-span-4">
      <button
        onClick={onChangeItem}
        className="w-full text-left px-3 py-1.5 bg-gray-900 border border-gray-700 hover:border-indigo-500 rounded text-xs text-indigo-300 font-medium transition-colors truncate"
      >
        {drop.Item || t('map_engine.select_item' as any)}
      </button>
    </div>
    <div className="col-span-2">
      <input
        type="number"
        value={drop.Rate}
        min={1}
        max={100000}
        onChange={e => onChangeRate(parseInt(e.target.value) || 0)}
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-center text-emerald-400 focus:outline-none focus:border-indigo-500"
      />
    </div>
    <div className="col-span-4">
      <input
        type="text"
        value={drop.RandomOptionGroup || ''}
        placeholder="None"
        onChange={e => onChangeROG(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-purple-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        list="rog-list"
      />
      <datalist id="rog-list">
        {optionNames.map(n => <option key={n} value={n} />)}
      </datalist>
    </div>
    <div className="col-span-1 flex justify-center">
      <button onClick={onRemove} className="text-gray-500 hover:text-rose-400 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

/**
 * MapEngine component managing the editor workspace for custom map drops and spawns.
 */
export const MapEngine: React.FC = () => {
  const t = useLanguageStore(state => state.t);

  // ── Global State ──
  const [activeTab, setActiveTab] = useState<'drops' | 'spawns'>('drops');
  const [alertMsg, setAlertMsg] = useState<AlertMsg>(null);

  // ── Map Drops State ──
  const [maps, setMaps] = useState<MapEntry[]>([]);
  const [isLoadingDrops, setIsLoadingDrops] = useState(true);
  const [isSavingDrops, setIsSavingDrops] = useState(false);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [mapSearch, setMapSearch] = useState('');
  const [yamlPreview, setYamlPreview] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [expandedMobGroups, setExpandedMobGroups] = useState<Record<string, boolean>>({});

  // ── Picker modals ──
  type PickerTarget =
    | { kind: 'global'; dropIdx: number }
    | { kind: 'specific'; mobIdx: number; dropIdx: number }
    | { kind: 'mob'; mobIdx: number }
    | { kind: 'spawn' }
    | null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [pickerType, setPickerType] = useState<'item' | 'mob'>('item');

  // ── Custom Spawns State ──
  const [spawnForm, setSpawnForm] = useState<SpawnForm>({
    map: 'prontera',
    x: 150,
    y: 150,
    rx: 10,
    ry: 10,
    monsterAegis: '',
    monsterName: '',
    monsterId: 0,
    amount: 5,
    respawn: 5000,
  });
  const [isInjectingSpawn, setIsInjectingSpawn] = useState(false);
  const [validMapNames, setValidMapNames] = useState<string[]>([]);
  const [activeSpawnMap, setActiveSpawnMap] = useState<string>('');
  const [activeMapSpawns, setActiveMapSpawns] = useState<any[]>([]);
  const [activeMapSpawnsLoading, setActiveMapSpawnsLoading] = useState<boolean>(false);
  const [activeSpawnMapsList, setActiveSpawnMapsList] = useState<string[]>([]);

  // ─── Load Map Drops ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMapDrops();
    fetchValidMapNames();
  }, []);

  const fetchValidMapNames = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/maps/list`);
      setValidMapNames(res.data || []);
    } catch (err) {
      console.error('Error fetching valid maps:', err);
    }
  };

  const fetchMapDrops = async () => {
    try {
      setIsLoadingDrops(true);
      const res = await axios.get(`${API_URL}/api/map-drops`);
      const loaded: MapEntry[] = (res.data.maps || []).map((m: MapEntry) => ({
        ...m,
        GlobalDrops: m.GlobalDrops || [],
        SpecificDrops: m.SpecificDrops || [],
      }));
      setMaps(loaded);
      if (loaded.length > 0 && !selectedMap) {
        setSelectedMap(loaded[0].Map);
      }
    } catch (err) {
      console.error('Error fetching map drops:', err);
    } finally {
      setIsLoadingDrops(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'spawns') {
      fetchActiveSpawnMaps();
    }
  }, [activeTab]);

  const fetchActiveSpawnMaps = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/scripts/custom-spawns/maps`);
      setActiveSpawnMapsList(res.data.maps || []);
      if (res.data.maps && res.data.maps.length > 0 && !activeSpawnMap) {
        setActiveSpawnMap(res.data.maps[0]);
        setSpawnForm(f => ({ ...f, map: res.data.maps[0] }));
      }
    } catch (err) {
      console.error('Error fetching active spawn maps:', err);
    }
  };

  const fetchSpawnsForMap = async (mapName: string) => {
    if (!mapName) return;
    try {
      setActiveMapSpawnsLoading(true);
      const res = await axios.get(`${API_URL}/api/scripts/custom-spawns/maps/${mapName}`);
      setActiveMapSpawns(res.data.spawns || []);
    } catch (err) {
      console.error('Error fetching spawns for map:', err);
    } finally {
      setActiveMapSpawnsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'spawns' && activeSpawnMap) {
      fetchSpawnsForMap(activeSpawnMap);
    }
  }, [activeSpawnMap, activeTab]);

  // ─── Derived ────────────────────────────────────────────────────────────────

  const filteredMaps = useMemo(() => {
    if (!mapSearch.trim()) return maps;
    const q = mapSearch.toLowerCase();
    return maps.filter(m => m.Map.toLowerCase().includes(q));
  }, [maps, mapSearch]);

  const currentMapEntry = useMemo(() => {
    return maps.find(m => m.Map === selectedMap) || null;
  }, [maps, selectedMap]);

  const liveSnippet = useMemo(() => buildSpawnSnippet(spawnForm), [spawnForm]);

  // ─── Map Drops Mutations ─────────────────────────────────────────────────────

  const updateMap = useCallback((updater: (m: MapEntry) => MapEntry) => {
    if (!selectedMap) return;
    setMaps(prev => prev.map(m => (m.Map === selectedMap ? updater(m) : m)));
  }, [selectedMap]);

  const handleAddMap = () => {
    const newMap: MapEntry = {
      Map: `new_map_${Date.now()}`,
      GlobalDrops: [],
      SpecificDrops: [],
    };
    setMaps(prev => [newMap, ...prev]);
    setSelectedMap(newMap.Map);
  };

  const handleDeleteMap = (mapName: string) => {
    setMaps(prev => prev.filter(m => m.Map !== mapName));
    if (selectedMap === mapName) {
      const remaining = maps.filter(m => m.Map !== mapName);
      setSelectedMap(remaining.length > 0 ? remaining[0].Map : null);
    }
  };

  // Global Drops
  const addGlobalDrop = () => {
    updateMap(m => ({
      ...m,
      GlobalDrops: [...m.GlobalDrops, { Index: nextIndex(m.GlobalDrops), Item: '', Rate: 100, RandomOptionGroup: null }],
    }));
  };

  const updateGlobalDrop = (idx: number, patch: Partial<DropEntry>) => {
    updateMap(m => ({
      ...m,
      GlobalDrops: m.GlobalDrops.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));
  };

  const removeGlobalDrop = (idx: number) => {
    updateMap(m => ({ ...m, GlobalDrops: m.GlobalDrops.filter((_, i) => i !== idx) }));
  };

  // Specific Drops (mob groups)
  const addMobGroup = () => {
    updateMap(m => ({
      ...m,
      SpecificDrops: [...m.SpecificDrops, { Monster: '', Drops: [] }],
    }));
  };

  const updateMobName = (mobIdx: number, name: string) => {
    updateMap(m => ({
      ...m,
      SpecificDrops: m.SpecificDrops.map((s, i) => (i === mobIdx ? { ...s, Monster: name } : s)),
    }));
  };

  const removeMobGroup = (mobIdx: number) => {
    updateMap(m => ({
      ...m,
      SpecificDrops: m.SpecificDrops.filter((_, i) => i !== mobIdx),
    }));
  };

  const addMobDrop = (mobIdx: number) => {
    updateMap(m => ({
      ...m,
      SpecificDrops: m.SpecificDrops.map((s, i) => {
        if (i !== mobIdx) return s;
        return {
          ...s,
          Drops: [...s.Drops, { Index: nextIndex(s.Drops), Item: '', Rate: 100, RandomOptionGroup: null }],
        };
      }),
    }));
  };

  const updateMobDrop = (mobIdx: number, dropIdx: number, patch: Partial<DropEntry>) => {
    updateMap(m => ({
      ...m,
      SpecificDrops: m.SpecificDrops.map((s, i) => {
        if (i !== mobIdx) return s;
        return { ...s, Drops: s.Drops.map((d, j) => (j === dropIdx ? { ...d, ...patch } : d)) };
      }),
    }));
  };

  const removeMobDrop = (mobIdx: number, dropIdx: number) => {
    updateMap(m => ({
      ...m,
      SpecificDrops: m.SpecificDrops.map((s, i) => {
        if (i !== mobIdx) return s;
        return { ...s, Drops: s.Drops.filter((_, j) => j !== dropIdx) };
      }),
    }));
  };

  // ─── Picker handler ─────────────────────────────────────────────────────────

  const openPicker = (target: PickerTarget, type: 'item' | 'mob') => {
    setPickerTarget(target);
    setPickerType(type);
    setPickerOpen(true);
  };

  const handlePickerSelect = (id: number | string, name: string) => {
    if (!pickerTarget) return;
    if (pickerTarget.kind === 'global') {
      updateGlobalDrop(pickerTarget.dropIdx, { Item: String(name) });
    } else if (pickerTarget.kind === 'specific') {
      updateMobDrop(pickerTarget.mobIdx, pickerTarget.dropIdx, { Item: String(name) });
    } else if (pickerTarget.kind === 'mob') {
      updateMobName(pickerTarget.mobIdx, String(name));
    } else if (pickerTarget.kind === 'spawn') {
      setSpawnForm(prev => ({
        ...prev,
        monsterAegis: String(name),
        monsterName: String(name),
        monsterId: Number(id),
      }));
    }
    setPickerOpen(false);
    setPickerTarget(null);
  };

  // ─── Save Map Drops ──────────────────────────────────────────────────────────

  const handleSaveDrops = async () => {
    try {
      setIsSavingDrops(true);
      setAlertMsg(null);
      await axios.put(`${API_URL}/api/map-drops`, { maps });
      setAlertMsg({ text: t('map_engine.save_map_drops_success' as any) as string, type: 'success' });
    } catch {
      setAlertMsg({ text: t('map_engine.save_map_drops_error' as any) as string, type: 'error' });
    } finally {
      setIsSavingDrops(false);
      setTimeout(() => setAlertMsg(null), 4000);
    }
  };

  // ─── YAML Preview ────────────────────────────────────────────────────────────

  const handleRefreshPreview = async () => {
    if (!currentMapEntry) return;
    try {
      setIsLoadingPreview(true);
      const res = await axios.post(`${API_URL}/api/map-drops/preview`, { maps: [currentMapEntry] });
      setYamlPreview(res.data.yaml || '');
    } catch (err) {
      setYamlPreview('# Erro ao gerar preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ─── Inject Spawn ────────────────────────────────────────────────────────────

  const handleInjectSpawn = async () => {
    if (!spawnForm.monsterId || !spawnForm.map) return;
    
    try {
      setIsInjectingSpawn(true);
      setAlertMsg(null);
      
      await axios.post(`${API_URL}/api/scripts/custom-spawns/maps/${spawnForm.map}`, {
        mapname: spawnForm.map,
        x: spawnForm.x,
        y: spawnForm.y,
        rx: spawnForm.rx,
        ry: spawnForm.ry,
        mobid: spawnForm.monsterId,
        mobname: spawnForm.monsterAegis,
        amount: spawnForm.amount,
        delay1: spawnForm.respawn,
        event: ""
      });

      setAlertMsg({ text: t('map_engine.inject_success' as any) as string, type: 'success' });
      setActiveSpawnMap(spawnForm.map);
      fetchActiveSpawnMaps();
      fetchSpawnsForMap(spawnForm.map);

    } catch (err) {
      console.error('Injection error:', err);
      setAlertMsg({ text: t('map_engine.inject_error' as any) as string, type: 'error' });
    } finally {
      setIsInjectingSpawn(false);
      setTimeout(() => setAlertMsg(null), 4000);
    }
  };
  const handleDeleteSpawn = async (mapName: string, uuid: string) => {
    try {
      await axios.delete(`${API_URL}/api/scripts/custom-spawns/maps/${mapName}/${uuid}`);
      fetchActiveSpawnMaps();
      fetchSpawnsForMap(mapName);
    } catch (err) {
      console.error('Error deleting spawn:', err);
      alert('Error deleting spawn. See console.');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4 p-4 text-gray-100">

      {/* ── Banner Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-gradient-to-r from-gray-900 via-teal-950/30 to-gray-900 p-4 rounded-xl border border-teal-500/20 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Map className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-teal-300 via-cyan-300 to-blue-300 bg-clip-text text-transparent">
              {t('map_engine.title' as any)}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">{t('map_engine.subtitle' as any)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 md:mt-0">
          {alertMsg && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
              alertMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {alertMsg.type === 'success'
                ? <Check className="w-4 h-4" />
                : <AlertCircle className="w-4 h-4" />}
              <span>{alertMsg.text}</span>
            </div>
          )}

          {/* Tab Switch */}
          <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800">
            <button
              onClick={() => setActiveTab('drops')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'drops' ? 'bg-teal-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              {t('map_engine.tab_map_drops' as any)}
            </button>
            <button
              onClick={() => setActiveTab('spawns')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'spawns' ? 'bg-teal-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Skull className="w-3.5 h-3.5" />
              {t('map_engine.tab_custom_spawns' as any)}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1 — MAP DROPS DATABASE                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'drops' && (
        <div className="flex flex-1 gap-4 overflow-hidden">

          {/* Left — Map list */}
          <div className="w-72 flex flex-col bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden shadow-md">
            <div className="p-3 border-b border-gray-800 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={mapSearch}
                  onChange={e => setMapSearch(e.target.value)}
                  placeholder={t('map_engine.search_map_placeholder' as any) as string}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-teal-500"
                />
              </div>
              <button
                onClick={handleAddMap}
                className="w-full flex items-center justify-center gap-2 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('map_engine.new_map_entry' as any)}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-800/50">
              {isLoadingDrops ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : filteredMaps.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">No maps found.</div>
              ) : (
                filteredMaps.map(m => (
                  <div
                    key={m.Map}
                    onClick={() => setSelectedMap(m.Map)}
                    className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                      selectedMap === m.Map
                        ? 'bg-teal-600/20 border-l-4 border-teal-500 text-white'
                        : 'hover:bg-gray-800/60 text-gray-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm font-mono truncate">{m.Map}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.GlobalDrops.length > 0 && (
                          <span className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">
                            {m.GlobalDrops.length} global
                          </span>
                        )}
                        {m.SpecificDrops.length > 0 && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20">
                            {m.SpecificDrops.length} mob(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteMap(m.Map); }}
                      className="p-1.5 text-gray-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Save button */}
            <div className="p-3 border-t border-gray-800">
              <button
                onClick={handleSaveDrops}
                disabled={isSavingDrops}
                className="w-full flex items-center justify-center gap-2 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-lg shadow-teal-600/30 transition-all"
              >
                {isSavingDrops ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('map_engine.save_map_drops' as any)}
              </button>
            </div>
          </div>

          {/* Right — Editor */}
          <div className="flex-1 flex flex-col overflow-hidden gap-4">
            {currentMapEntry ? (
              <>
                {/* ⚠️ Absolute Drops Banner */}
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    {t('map_engine.absolute_drops_banner' as any)}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4">
                  {/* Map Name */}
                  <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                      {t('map_engine.map_name' as any)}
                    </label>
                    <input
                      type="text"
                      value={currentMapEntry.Map}
                      onChange={e => updateMap(m => ({ ...m, Map: e.target.value }))}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-teal-300 focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  {/* Global Drops */}
                  <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                          <Globe className="w-4 h-4 text-blue-400" />
                          {t('map_engine.global_drops_section' as any)}
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">{t('map_engine.global_drops_desc' as any)}</p>
                      </div>
                      <button
                        onClick={addGlobalDrop}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('map_engine.add_global_drop' as any)}
                      </button>
                    </div>

                    {currentMapEntry.GlobalDrops.length > 0 ? (
                      <div className="space-y-2">
                        {/* Header row */}
                        <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold uppercase text-gray-500">
                          <div className="col-span-1 text-center">#</div>
                          <div className="col-span-4">{t('map_engine.item_aegis' as any)}</div>
                          <div className="col-span-2 text-center">{t('map_engine.rate' as any)}</div>
                          <div className="col-span-4">{t('map_engine.random_opt_group' as any)}</div>
                          <div className="col-span-1" />
                        </div>
                        {currentMapEntry.GlobalDrops.map((drop, idx) => (
                          <DropRow
                            key={idx}
                            drop={drop}
                            optionNames={[]}
                            onChangeItem={() => openPicker({ kind: 'global', dropIdx: idx }, 'item')}
                            onChangeRate={val => updateGlobalDrop(idx, { Rate: val })}
                            onChangeROG={val => updateGlobalDrop(idx, { RandomOptionGroup: val || null })}
                            onRemove={() => removeGlobalDrop(idx)}
                            t={t as any}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs text-gray-500">No global drops configured.</div>
                    )}
                  </div>

                  {/* Specific Monster Drops */}
                  <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                          <Target className="w-4 h-4 text-purple-400" />
                          {t('map_engine.specific_drops_section' as any)}
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">{t('map_engine.specific_drops_desc' as any)}</p>
                      </div>
                      <button
                        onClick={addMobGroup}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('map_engine.add_mob_group' as any)}
                      </button>
                    </div>

                    <div className="space-y-3">
                      {currentMapEntry.SpecificDrops.map((mobGroup, mobIdx) => {
                        const groupKey = `${selectedMap}_${mobIdx}`;
                        const isExpanded = expandedMobGroups[groupKey] !== false;
                        return (
                          <div key={mobIdx} className="bg-gray-950/60 border border-gray-800 rounded-lg overflow-hidden">
                            {/* Mob group header */}
                            <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/80 bg-gray-900/40">
                              <button
                                onClick={() => setExpandedMobGroups(prev => ({ ...prev, [groupKey]: !isExpanded }))}
                                className="text-gray-500 hover:text-gray-300"
                              >
                                {isExpanded
                                  ? <ChevronDown className="w-4 h-4" />
                                  : <ChevronRight className="w-4 h-4" />}
                              </button>
                              <Skull className="w-4 h-4 text-purple-400" />
                              <button
                                onClick={() => openPicker({ kind: 'mob', mobIdx }, 'mob')}
                                className="flex-1 text-left text-sm font-semibold text-purple-300 hover:text-purple-100 transition-colors truncate"
                              >
                                {mobGroup.Monster || t('map_engine.select_mob' as any)}
                              </button>
                              <span className="text-xs text-gray-500">{mobGroup.Drops.length} drops</span>
                              <button
                                onClick={() => removeMobGroup(mobIdx)}
                                className="text-gray-500 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="p-3 space-y-2">
                                {/* Drop header */}
                                {mobGroup.Drops.length > 0 && (
                                  <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold uppercase text-gray-500">
                                    <div className="col-span-1 text-center">#</div>
                                    <div className="col-span-4">{t('map_engine.item_aegis' as any)}</div>
                                    <div className="col-span-2 text-center">{t('map_engine.rate' as any)}</div>
                                    <div className="col-span-4">{t('map_engine.random_opt_group' as any)}</div>
                                    <div className="col-span-1" />
                                  </div>
                                )}
                                {mobGroup.Drops.map((drop, dropIdx) => (
                                  <DropRow
                                    key={dropIdx}
                                    drop={drop}
                                    optionNames={[]}
                                    onChangeItem={() => openPicker({ kind: 'specific', mobIdx, dropIdx }, 'item')}
                                    onChangeRate={val => updateMobDrop(mobIdx, dropIdx, { Rate: val })}
                                    onChangeROG={val => updateMobDrop(mobIdx, dropIdx, { RandomOptionGroup: val || null })}
                                    onRemove={() => removeMobDrop(mobIdx, dropIdx)}
                                    t={t as any}
                                  />
                                ))}
                                <button
                                  onClick={() => addMobDrop(mobIdx)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                  {t('map_engine.add_drop' as any)}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {currentMapEntry.SpecificDrops.length === 0 && (
                        <div className="text-center py-4 text-xs text-gray-500">No specific monster drops configured.</div>
                      )}
                    </div>
                  </div>

                  {/* Raw Code Panel */}
                  <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-950/40">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                        <Code2 className="w-4 h-4 text-teal-400" />
                        {t('map_engine.raw_code_panel' as any)}
                      </div>
                      <button
                        onClick={handleRefreshPreview}
                        disabled={isLoadingPreview}
                        className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded text-xs transition-colors"
                      >
                        {isLoadingPreview
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                        {t('map_engine.raw_code_refresh' as any)}
                      </button>
                    </div>
                    <pre className="p-4 text-xs text-teal-300 font-mono leading-relaxed overflow-auto max-h-64 bg-gray-950/60 whitespace-pre-wrap">
                      {yamlPreview || '# Clique em "Atualizar Preview" para gerar o YAML.'}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                {t('map_engine.no_map_selected' as any)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2 — CUSTOM SPAWNS */}
      {activeTab === 'spawns' && (
        <MapSpawnsTab />
      )}

      {/* ── ReferencePicker Modal ── */}
      <ReferencePicker
        isOpen={pickerOpen}
        onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
        onSelect={handlePickerSelect}
        type={pickerType}
        title={
          pickerType === 'mob'
            ? (t('map_engine.select_mob' as any) as string)
            : (t('map_engine.select_item' as any) as string)
        }
      />
    </div>
  );
};

export default MapEngine;
