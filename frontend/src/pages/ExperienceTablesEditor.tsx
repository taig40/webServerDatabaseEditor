import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useLanguageStore } from '../store/useLanguageStore';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  TrendingUp,
  Save,
  Sliders,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Table as TableIcon
} from 'lucide-react';

interface ExpEntry {
  Level: number;
  Exp: number;
}

interface ExpTableEntry {
  className?: string;
  category?: string;
  base_exp?: ExpEntry[];
  job_exp?: ExpEntry[];
  base_index?: number;
  job_index?: number;
  MaxBaseLevel?: number;
  MaxJobLevel?: number;
  _index?: number;
  BaseExp?: ExpEntry[];
  JobExp?: ExpEntry[];
  Jobs?: Record<string, boolean> | string[];
}

const formatYAxisTick = (val: number) => {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
};

const ExperienceTablesEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [tables, setTables] = useState<ExpTableEntry[]>([]);
  const [selectedTableIndex, setSelectedTableIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchExpTables();
  }, []);

  const fetchExpTables = async () => {
    setLoading(true);
    setToastMessage(null);
    try {
      const res = await axios.get(`${API_URL}/api/progression/exp`);
      setTables(res.data.tables || []);
    } catch (err: any) {
      console.error('Error loading experience tables:', err);
      setToastMessage({ text: t('exp_table_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const currentTable = tables[selectedTableIndex] || null;

  const chartData = useMemo(() => {
    const baseList = currentTable?.base_exp || currentTable?.BaseExp || [];
    const jobList = currentTable?.job_exp || currentTable?.JobExp || [];
    const maxLen = Math.max(baseList.length, jobList.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
      const baseEntry = baseList[i];
      const jobEntry = jobList[i];
      result.push({
        level: baseEntry?.Level || jobEntry?.Level || i + 1,
        baseExp: baseEntry?.Exp || 0,
        jobExp: jobEntry?.Exp || 0
      });
    }
    return result;
  }, [currentTable]);

  const handleValueChange = (curveType: 'base_exp' | 'job_exp', idx: number, newExp: number) => {
    if (!currentTable) return;
    const currentList = curveType === 'base_exp'
      ? (currentTable.base_exp || currentTable.BaseExp || [])
      : (currentTable.job_exp || currentTable.JobExp || []);

    const newList = [...currentList];
    newList[idx] = {
      Level: newList[idx]?.Level || idx + 1,
      Exp: Math.max(0, newExp)
    };

    const updatedTable = {
      ...currentTable,
      [curveType]: newList
    };

    const newTables = [...tables];
    newTables[selectedTableIndex] = updatedTable;
    setTables(newTables);
  };

  const handleScaleCurve = () => {
    if (!currentTable) return;
    const input = window.prompt(t('exp_table_editor.scale_prompt') || 'Enter percentage (e.g. 110 for +10%):', '110');
    if (!input) return;
    const factor = parseFloat(input) / 100;
    if (isNaN(factor) || factor <= 0) return;

    const baseList = currentTable.base_exp || currentTable.BaseExp || [];
    const jobList = currentTable.job_exp || currentTable.JobExp || [];

    const newBaseList = baseList.map(entry => ({
      ...entry,
      Exp: Math.round(entry.Exp * factor)
    }));
    const newJobList = jobList.map(entry => ({
      ...entry,
      Exp: Math.round(entry.Exp * factor)
    }));

    const updatedTable = {
      ...currentTable,
      base_exp: newBaseList,
      job_exp: newJobList
    };

    const newTables = [...tables];
    newTables[selectedTableIndex] = updatedTable;
    setTables(newTables);
  };

  const handleSave = async () => {
    if (!currentTable) return;
    setSaving(true);
    setToastMessage(null);
    try {
      await axios.put(`${API_URL}/api/progression/exp`, {
        className: currentTable.className || 'Unknown',
        base_index: currentTable.base_index !== undefined ? currentTable.base_index : (currentTable._index ?? -1),
        job_index: currentTable.job_index !== undefined ? currentTable.job_index : (currentTable._index ?? -1),
        base_exp: currentTable.base_exp || currentTable.BaseExp || [],
        job_exp: currentTable.job_exp || currentTable.JobExp || []
      });
      setToastMessage({ text: t('exp_table_editor.save_success'), type: 'success' });
    } catch (err: any) {
      setToastMessage({ text: t('exp_table_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const getTableTitle = (entry: ExpTableEntry, idx: number) => {
    if (entry.className) return entry.className;
    if (entry.Jobs) {
      if (Array.isArray(entry.Jobs)) return entry.Jobs.slice(0, 3).join(', ');
      if (typeof entry.Jobs === 'object') return Object.keys(entry.Jobs).slice(0, 3).join(', ');
    }
    return `EXP Table #${idx + 1}`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0f0f14] overflow-y-auto">
      {/* Top Header */}
      <div className="px-8 py-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-[#13131c]/60 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            {t('exp_table_editor.title')}
          </h1>
          <p className="text-xs text-gray-400 mt-1">{t('exp_table_editor.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Table / Class Selector */}
          <select
            value={selectedTableIndex}
            onChange={e => setSelectedTableIndex(parseInt(e.target.value))}
            className="bg-black/40 border border-white/10 text-white text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-all"
          >
            {tables.map((tbl, idx) => (
              <option key={idx} value={idx}>
                {getTableTitle(tbl, idx)}
              </option>
            ))}
          </select>

          <button
            onClick={handleScaleCurve}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all"
          >
            <Sliders className="w-4 h-4 text-indigo-400" />
            {t('exp_table_editor.scale_btn')}
          </button>

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
            disabled={saving || !currentTable}
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            {t('exp_table_editor.save_btn')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-gray-500 text-sm">...</div>
      ) : !currentTable ? (
        <div className="p-16 text-center text-gray-500 text-sm">---</div>
      ) : (
        <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
          {/* Interactive Stacked Recharts Visualization */}
          <div className="lg:col-span-2 flex flex-col gap-4 h-[580px]">
            {/* Top Chart: Base EXP */}
            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="font-bold text-xs text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  {t('exp_table_editor.base_curve')}
                </h3>
                <span className="text-[11px] text-gray-400">
                  Max Lv: {chartData.length}
                </span>
              </div>

              <div className="w-full flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} syncId="expSync">
                    <defs>
                      <linearGradient id="baseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="level" stroke="#9ca3af" fontSize={11} />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={11}
                      tickFormatter={formatYAxisTick}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(value: any) => [Number(value || 0).toLocaleString(), t('exp_table_editor.col_base_exp')]}
                      labelFormatter={(label) => `Lv ${label}`}
                      contentStyle={{
                        backgroundColor: '#181824',
                        borderColor: '#ffffff15',
                        borderRadius: '12px',
                        fontSize: '12px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="baseExp"
                      name={t('exp_table_editor.col_base_exp')}
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#baseGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Chart: Job EXP */}
            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="font-bold text-xs text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  {t('exp_table_editor.job_curve')}
                </h3>
                <span className="text-[11px] text-gray-400">
                  Max Lv: {chartData.length}
                </span>
              </div>

              <div className="w-full flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} syncId="expSync">
                    <defs>
                      <linearGradient id="jobGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="level" stroke="#9ca3af" fontSize={11} />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={11}
                      tickFormatter={formatYAxisTick}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(value: any) => [Number(value || 0).toLocaleString(), t('exp_table_editor.col_job_exp')]}
                      labelFormatter={(label) => `Lv ${label}`}
                      contentStyle={{
                        backgroundColor: '#181824',
                        borderColor: '#ffffff15',
                        borderRadius: '12px',
                        fontSize: '12px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="jobExp"
                      name={t('exp_table_editor.col_job_exp')}
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#jobGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Editable Data Table with Virtual Scroll */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[580px]">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-indigo-400" />
                {currentTable.className || 'EXP Data Grid'}
              </h3>
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-black/25">
              {/* Header Row */}
              <div className="flex items-center text-xs font-semibold text-gray-400 bg-black/40 border-b border-white/10 px-5 py-3 sticky top-0 z-10">
                <div className="w-16 shrink-0">{t('exp_table_editor.col_level')}</div>
                <div className="flex-1 px-2">{t('exp_table_editor.col_base_exp')}</div>
                <div className="flex-1 px-2">{t('exp_table_editor.col_job_exp')}</div>
              </div>

              {/* Virtualized Rows */}
              <Virtuoso
                style={{ height: '100%' }}
                data={chartData}
                itemContent={(index, row) => (
                  <div className="flex items-center text-xs text-gray-300 border-b border-white/5 hover:bg-white/5 transition-all px-5 py-2">
                    {/* Level */}
                    <div className="w-16 shrink-0 font-bold text-indigo-300">Lv {row.level}</div>

                    {/* Base EXP Input */}
                    <div className="flex-1 px-2">
                      <input
                        type="number"
                        value={row.baseExp}
                        onChange={e => handleValueChange('base_exp', index, parseInt(e.target.value) || 0)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-white font-mono text-xs w-full focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Job EXP Input */}
                    <div className="flex-1 px-2">
                      <input
                        type="number"
                        value={row.jobExp}
                        onChange={e => handleValueChange('job_exp', index, parseInt(e.target.value) || 0)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-white font-mono text-xs w-full focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExperienceTablesEditor;
