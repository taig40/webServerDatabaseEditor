import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguageStore } from '../store/useLanguageStore';
import { API_URL } from '../config/env';
import {
  Search,
  Save,
  Shield,
  Activity,
  Heart,
  Zap,
  Weight,
  Layers,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Sword,
  Shirt
} from 'lucide-react';

interface JobStatsEntry {
  _index: number;
  Jobs?: Record<string, boolean> | string[];
  MaxWeight?: number;
  HpFactor?: number;
  HpIncrease?: number;
  SpFactor?: number;
  SpIncrease?: number;
  ApFactor?: number;
  ApIncrease?: number;
  category?: string;
  has_alternate_sprite?: boolean;
  is_alternate_sprite?: boolean;
  BonusStats?: Array<{
    Level?: number;
    Str?: number;
    Agi?: number;
    Vit?: number;
    Int?: number;
    Dex?: number;
    Luk?: number;
  }>;
}

interface JobBasepointsEntry {
  _index: number;
  Jobs?: Record<string, boolean> | string[];
  BaseHp?: Array<{ Level: number; Hp: number }>;
  BaseSp?: Array<{ Level: number; Sp: number }>;
  BaseAp?: Array<{ Level: number; Ap: number }>;
}

interface JobAspdEntry {
  _index: number;
  Jobs?: Record<string, boolean> | string[];
  BaseASPD?: Record<string, number>;
}

interface JobOutfitsEntry {
  _index: number;
  Jobs?: Record<string, boolean> | string[];
  AlternateOutfits?: Record<string, boolean>;
}

const WEAPON_TYPES = [
  'Fist', 'Dagger', '1hSword', '2hSword', '1hSpear', '2hSpear', '1hAxe', '2hAxe',
  'Mace', '2hMace', 'Staff', '2hStaff', 'Rod', 'Bow', 'Knuckle', 'Musical',
  'Whip', 'Book', 'Katar', 'Revolver', 'Rifle', 'Shotgun', 'Gatling', 'Grenade',
  'Huuma', 'FoShield'
];

const JobDatabaseEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [statsEntries, setStatsEntries] = useState<JobStatsEntry[]>([]);
  const [basepointsEntries, setBasepointsEntries] = useState<JobBasepointsEntry[]>([]);
  const [aspdEntries, setAspdEntries] = useState<JobAspdEntry[]>([]);
  const [outfitsEntries, setOutfitsEntries] = useState<JobOutfitsEntry[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedJobIndex, setSelectedJobIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'stats' | 'basepoints' | 'aspd' | 'outfits'>('stats');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Non-Transcendent' | 'Transcendent' | 'Baby'>('all');
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [newOutfitName, setNewOutfitName] = useState<string>('');

  useEffect(() => {
    fetchJobsData();
  }, []);

  const fetchJobsData = async () => {
    setLoading(true);
    setToastMessage(null);
    try {
      const res = await axios.get(`${API_URL}/api/progression/jobs`);
      setStatsEntries(res.data.job_stats || []);
      setBasepointsEntries(res.data.job_basepoints || []);
      setAspdEntries(res.data.job_aspd || []);
      setOutfitsEntries(res.data.job_outfits || []);
    } catch (err: any) {
      console.error('Error loading jobs progression:', err);
      setToastMessage({ text: t('jobs_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const getJobNames = (entry: any): string[] => {
    if (!entry || !entry.Jobs) return ['Unnamed Job Group'];
    if (Array.isArray(entry.Jobs)) return entry.Jobs;
    if (typeof entry.Jobs === 'object') return Object.keys(entry.Jobs);
    return ['Unnamed'];
  };

  const filteredEntries = statsEntries.filter(entry => {
    if (entry.is_alternate_sprite) return false;
    if (categoryFilter !== 'all' && entry.category && entry.category !== categoryFilter) return false;
    const names = getJobNames(entry).join(' ').toLowerCase();
    return names.includes(searchTerm.toLowerCase());
  });

  const selectedStats = statsEntries[selectedJobIndex] || null;
  const selectedJobNames = selectedStats ? getJobNames(selectedStats) : [];

  // Match the entries in other files
  const selectedBasepoints = basepointsEntries.find(bp => {
    const bpNames = getJobNames(bp);
    return selectedJobNames.some(name => bpNames.includes(name));
  }) || null;

  const selectedAspd = aspdEntries.find(bp => {
    const bpNames = getJobNames(bp);
    return selectedJobNames.some(name => bpNames.includes(name));
  }) || null;

  const selectedOutfits = outfitsEntries.find(bp => {
    const bpNames = getJobNames(bp);
    return selectedJobNames.some(name => bpNames.includes(name));
  }) || null;

  const handleStatsChange = (field: keyof JobStatsEntry, val: any) => {
    if (!selectedStats) return;
    const updated = { ...selectedStats, [field]: val };
    const newList = [...statsEntries];
    newList[selectedJobIndex] = updated;
    setStatsEntries(newList);
  };

  const handleSave = async () => {
    if (!selectedStats) return;
    setSaving(true);
    setToastMessage(null);
    try {
      // Save stats
      await axios.put(`${API_URL}/api/progression/jobs/stats`, {
        index: selectedStats._index,
        data: selectedStats
      });

      // Save basepoints
      if (selectedBasepoints) {
        await axios.put(`${API_URL}/api/progression/jobs/basepoints`, {
          index: selectedBasepoints._index,
          data: selectedBasepoints
        });
      }

      // Save ASPD
      if (selectedAspd) {
        await axios.put(`${API_URL}/api/progression/jobs/aspd`, {
          index: selectedAspd._index,
          data: selectedAspd
        });
      }

      // Save Outfits
      if (selectedOutfits) {
        await axios.put(`${API_URL}/api/progression/jobs/outfits`, {
          index: selectedOutfits._index,
          data: selectedOutfits
        });
      }

      setToastMessage({ text: t('jobs_editor.save_success'), type: 'success' });
    } catch (err: any) {
      setToastMessage({ text: t('jobs_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const renderLeftList = () => (
    <div className="w-80 border-r border-white/10 flex flex-col bg-[#13131c]">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
          {t('jobs_editor.title')}
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('jobs_editor.search_placeholder')}
            className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {(['all', 'Non-Transcendent', 'Transcendent', 'Baby'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-[10px] font-semibold py-1 px-2 rounded-lg transition-all text-center truncate ${
                categoryFilter === cat
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                  : 'bg-black/30 text-gray-400 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              {cat === 'all'
                ? t('jobs_editor.cat_all')
                : cat === 'Non-Transcendent'
                ? t('jobs_editor.cat_non_transcendent')
                : cat === 'Transcendent'
                ? t('jobs_editor.cat_transcendent')
                : t('jobs_editor.cat_baby')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {loading ? (
          <div className="p-4 text-center text-xs text-gray-500">...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">---</div>
        ) : (
          filteredEntries.map(entry => {
            const names = getJobNames(entry);
            const isSelected = statsEntries.indexOf(entry) === selectedJobIndex;
            return (
              <button
                key={entry._index}
                onClick={() => setSelectedJobIndex(statsEntries.indexOf(entry))}
                className={`w-full text-left p-3.5 transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-600/20 to-transparent border-l-4 border-indigo-500 text-white'
                    : 'hover:bg-white/5 text-gray-300'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-gray-500'}`} />
                    <span className="font-semibold text-sm truncate">{names[0]}</span>
                  </div>
                  {names.length > 1 && (
                    <span className="text-[10px] text-gray-400 block mt-1 truncate">
                      +{names.slice(1).join(', ')}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const renderStatsTab = () => {
    if (!selectedStats) return null;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Weight className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium">{t('jobs_editor.max_weight')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.MaxWeight ?? 20000}
              onChange={e => handleStatsChange('MaxWeight', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-amber-500 transition-all"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Heart className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-medium">{t('jobs_editor.hp_factor')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.HpFactor ?? 0}
              onChange={e => handleStatsChange('HpFactor', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-rose-500 transition-all"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Heart className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-medium">{t('jobs_editor.hp_increase')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.HpIncrease ?? 500}
              onChange={e => handleStatsChange('HpIncrease', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-rose-500 transition-all"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium">{t('jobs_editor.sp_factor')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.SpFactor ?? 0}
              onChange={e => handleStatsChange('SpFactor', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium">{t('jobs_editor.sp_increase')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.SpIncrease ?? 100}
              onChange={e => handleStatsChange('SpIncrease', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium">{t('jobs_editor.ap_factor')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.ApFactor ?? 0}
              onChange={e => handleStatsChange('ApFactor', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-amber-500 transition-all"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 text-gray-400 mb-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium">{t('jobs_editor.ap_increase')}</span>
            </div>
            <input
              type="number"
              value={selectedStats.ApIncrease ?? 0}
              onChange={e => handleStatsChange('ApIncrease', parseInt(e.target.value) || 0)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-lg focus:outline-none focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        {/* Bonus Stats Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              {t('jobs_editor.bonus_stats')}
            </h3>
            <button
              onClick={() => {
                const currentBonus = selectedStats.BonusStats || [];
                handleStatsChange('BonusStats', [
                  ...currentBonus,
                  { Level: (currentBonus.length + 1) * 2, Str: 1 }
                ]);
              }}
              className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-400 bg-black/20">
                  <th className="p-3">{t('jobs_editor.level')}</th>
                  <th className="p-3">STR</th>
                  <th className="p-3">AGI</th>
                  <th className="p-3">VIT</th>
                  <th className="p-3">INT</th>
                  <th className="p-3">DEX</th>
                  <th className="p-3">LUK</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {(selectedStats.BonusStats || []).map((bonus, idx) => (
                  <tr key={idx} className="hover:bg-white/5">
                    <td className="p-3 font-semibold text-indigo-300">{bonus.Level ?? idx + 1}</td>
                    <td className="p-3">{bonus.Str || 0}</td>
                    <td className="p-3">{bonus.Agi || 0}</td>
                    <td className="p-3">{bonus.Vit || 0}</td>
                    <td className="p-3">{bonus.Int || 0}</td>
                    <td className="p-3">{bonus.Dex || 0}</td>
                    <td className="p-3">{bonus.Luk || 0}</td>
                    <td className="p-3">
                      <button
                        onClick={() => {
                          const current = [...(selectedStats.BonusStats || [])];
                          current.splice(idx, 1);
                          handleStatsChange('BonusStats', current);
                        }}
                        className="text-gray-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderBasepointsTab = () => {
    if (!selectedBasepoints) {
      return (
        <div className="p-8 text-center text-gray-400 bg-white/5 rounded-2xl border border-white/10">
          ---
        </div>
      );
    }

    const hpList = selectedBasepoints.BaseHp || [];
    const spList = selectedBasepoints.BaseSp || [];
    const apList = selectedBasepoints.BaseAp || [];

    return (
      <div className={`grid grid-cols-1 lg:grid-cols-${apList.length > 0 ? '3' : '2'} gap-6`}>
        {/* Base HP Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-400" />
              {t('jobs_editor.base_hp_table')}
            </h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-400 bg-black/20">
                  <th className="p-3">{t('jobs_editor.level')}</th>
                  <th className="p-3">Base HP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {hpList.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5">
                    <td className="p-3 font-semibold text-rose-300">Lv {row.Level}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={row.Hp}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          const newHpList = [...hpList];
                          newHpList[idx] = { ...row, Hp: val };
                          const updatedBp = { ...selectedBasepoints, BaseHp: newHpList };
                          setBasepointsEntries(basepointsEntries.map(b => b._index === updatedBp._index ? updatedBp : b));
                        }}
                        className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white w-24 focus:outline-none focus:border-rose-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Base SP Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              {t('jobs_editor.base_sp_table')}
            </h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-400 bg-black/20">
                  <th className="p-3">{t('jobs_editor.level')}</th>
                  <th className="p-3">Base SP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {spList.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5">
                    <td className="p-3 font-semibold text-blue-300">Lv {row.Level}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={row.Sp}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          const newSpList = [...spList];
                          newSpList[idx] = { ...row, Sp: val };
                          const updatedBp = { ...selectedBasepoints, BaseSp: newSpList };
                          setBasepointsEntries(basepointsEntries.map(b => b._index === updatedBp._index ? updatedBp : b));
                        }}
                        className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white w-24 focus:outline-none focus:border-blue-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Base AP Table */}
        {apList.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                {t('jobs_editor.base_ap_table')}
              </h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-gray-400 bg-black/20">
                    <th className="p-3">{t('jobs_editor.level')}</th>
                    <th className="p-3">Base AP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {apList.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/5">
                      <td className="p-3 font-semibold text-amber-300">Lv {row.Level}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={row.Ap}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            const newApList = [...apList];
                            newApList[idx] = { ...row, Ap: val };
                            const updatedBp = { ...selectedBasepoints, BaseAp: newApList };
                            setBasepointsEntries(basepointsEntries.map(b => b._index === updatedBp._index ? updatedBp : b));
                          }}
                          className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white w-24 focus:outline-none focus:border-amber-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAspdTab = () => {
    if (!selectedAspd) {
      return (
        <div className="p-8 text-center text-gray-400 bg-white/5 rounded-2xl border border-white/10">
          ---
        </div>
      );
    }

    const aspdMap = selectedAspd.BaseASPD || {};

    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-6">
          <Sword className="w-4 h-4 text-indigo-400" />
          {t('jobs_editor.tab_aspd')}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {WEAPON_TYPES.map(weapon => {
            const currentVal = aspdMap[weapon] ?? 2000;
            return (
              <div key={weapon} className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-gray-400 block mb-2 font-mono truncate">{weapon}</span>
                <input
                  type="number"
                  value={currentVal}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    const updatedAspdMap = { ...aspdMap, [weapon]: val };
                    const updatedAspd = { ...selectedAspd, BaseASPD: updatedAspdMap };
                    setAspdEntries(aspdEntries.map(a => a._index === updatedAspd._index ? updatedAspd : a));
                  }}
                  className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-indigo-500 font-mono text-center font-bold"
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderOutfitsTab = () => {
    if (!selectedOutfits) {
      return (
        <div className="p-8 text-center text-gray-400 bg-white/5 rounded-2xl border border-white/10">
          ---
        </div>
      );
    }

    const outfitsMap = selectedOutfits.AlternateOutfits || {};
    const outfitNames = Object.keys(outfitsMap);

    const handleAddOutfit = () => {
      if (!newOutfitName.trim()) return;
      const updatedMap = { ...outfitsMap, [newOutfitName.trim()]: true };
      const updatedOutfit = { ...selectedOutfits, AlternateOutfits: updatedMap };
      setOutfitsEntries(outfitsEntries.map(o => o._index === updatedOutfit._index ? updatedOutfit : o));
      setNewOutfitName('');
    };

    const handleRemoveOutfit = (name: string) => {
      const updatedMap = { ...outfitsMap };
      delete updatedMap[name];
      const updatedOutfit = { ...selectedOutfits, AlternateOutfits: updatedMap };
      setOutfitsEntries(outfitsEntries.map(o => o._index === updatedOutfit._index ? updatedOutfit : o));
    };

    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-6">
          <Shirt className="w-4 h-4 text-indigo-400" />
          {t('jobs_editor.tab_outfits')}
        </h3>

        <div className="flex gap-3 mb-6 max-w-md">
          <input
            type="text"
            value={newOutfitName}
            onChange={e => setNewOutfitName(e.target.value)}
            placeholder="Ex: Rune_Knight_2nd"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleAddOutfit}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>

        {outfitNames.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500 border border-dashed border-white/10 rounded-2xl">
            Nenhum traje alternativo configurado para esta classe.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {outfitNames.map(name => (
              <div key={name} className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">{name}</span>
                  <span className="text-[10px] text-indigo-300 font-mono mt-0.5 block">alternate outfit</span>
                </div>
                <button
                  onClick={() => handleRemoveOutfit(name)}
                  className="text-gray-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-[#0f0f14] overflow-hidden">
      {renderLeftList()}

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-[#13131c]/60 backdrop-blur-md sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
                <Layers className="w-6 h-6 text-indigo-400" />
                {selectedStats ? getJobNames(selectedStats).join(' / ') : t('jobs_editor.title')}
              </h1>
              {selectedStats?.has_alternate_sprite && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  {t('jobs_editor.has_alternate_sprite')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{t('jobs_editor.subtitle')}</p>
          </div>

          <div className="flex items-center gap-3">
            {toastMessage && (
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold animate-in fade-in ${
                  toastMessage.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {toastMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {toastMessage.text}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !selectedStats}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 transition-all"
            >
              <Save className="w-4 h-4" />
              {t('jobs_editor.save_btn')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-6">
          <div className="flex items-center gap-2 border-b border-white/10 pb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'stats'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('jobs_editor.tab_stats')}
            </button>
            <button
              onClick={() => setActiveTab('basepoints')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'basepoints'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('jobs_editor.tab_basepoints')}
            </button>
            <button
              onClick={() => setActiveTab('aspd')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'aspd'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('jobs_editor.tab_aspd')}
            </button>
            <button
              onClick={() => setActiveTab('outfits')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'outfits'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('jobs_editor.tab_outfits')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {activeTab === 'stats' && renderStatsTab()}
          {activeTab === 'basepoints' && renderBasepointsTab()}
          {activeTab === 'aspd' && renderAspdTab()}
          {activeTab === 'outfits' && renderOutfitsTab()}
        </div>
      </div>
    </div>
  );
};

export default JobDatabaseEditor;
