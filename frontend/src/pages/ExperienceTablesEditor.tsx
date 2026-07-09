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
  CartesianGrid
} from 'recharts';
import {
  TrendingUp,
  Save,
  Sliders,
  CheckCircle,
  AlertCircle,
  Database,
  BarChart3,
  Table as TableIcon
} from 'lucide-react';

interface ExpEntry {
  Level: number;
  Exp: number;
}

interface ExpTableEntry {
  _index: number;
  MaxBaseLevel?: number;
  BaseExp?: ExpEntry[];
  MaxJobLevel?: number;
  JobExp?: ExpEntry[];
  Jobs?: Record<string, boolean> | string[];
}

const ExperienceTablesEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [tables, setTables] = useState<ExpTableEntry[]>([]);
  const [selectedTableIndex, setSelectedTableIndex] = useState<number>(0);
  const [activeCurve, setActiveCurve] = useState<'BaseExp' | 'JobExp'>('BaseExp');
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
  const currentExpList = (currentTable?.[activeCurve] || []) as ExpEntry[];

  const chartData = useMemo(() => {
    return currentExpList.map((entry, idx) => {
      const prevVal = idx > 0 ? currentExpList[idx - 1].Exp : 0;
      return {
        level: entry.Level,
        exp: entry.Exp,
        delta: entry.Exp - prevVal
      };
    });
  }, [currentExpList]);

  const handleValueChange = (idx: number, newExp: number) => {
    if (!currentTable) return;
    const newList = [...currentExpList];
    newList[idx] = { ...newList[idx], Exp: Math.max(0, newExp) };

    const updatedTable = {
      ...currentTable,
      [activeCurve]: newList
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

    const newList = currentExpList.map(entry => ({
      ...entry,
      Exp: Math.round(entry.Exp * factor)
    }));
    const updatedTable = {
      ...currentTable,
      [activeCurve]: newList
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
        index: currentTable._index,
        data: currentTable
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
          {/* Table Selector */}
          <select
            value={selectedTableIndex}
            onChange={e => setSelectedTableIndex(parseInt(e.target.value))}
            className="bg-black/40 border border-white/10 text-white text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 animate-fade"
          >
            {tables.map((tbl, idx) => (
              <option key={idx} value={idx}>
                {getTableTitle(tbl, idx)}
              </option>
            ))}
          </select>

          {/* Curve Toggle */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-1 flex items-center">
            <button
              onClick={() => setActiveCurve('BaseExp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeCurve === 'BaseExp'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Base EXP
            </button>
            <button
              onClick={() => setActiveCurve('JobExp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeCurve === 'JobExp'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Job EXP
            </button>
          </div>

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
        <div className="p-16 text-center text-gray-500 text-sm">Carregando tabelas de experiência...</div>
      ) : !currentTable ? (
        <div className="p-16 text-center text-gray-500 text-sm">Nenhuma tabela encontrada.</div>
      ) : (
        <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
          {/* Interactive Recharts Visualization */}
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-between h-[500px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                {t('exp_table_editor.chart_title')} — {activeCurve}
              </h3>
              <span className="text-xs text-gray-400">
                Max Level: {currentExpList.length}
              </span>
            </div>

            <div className="h-80 w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="expGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="level" stroke="#888888" tick={{ fontSize: 10 }} />
                  <YAxis
                    stroke="#888888"
                    tick={{ fontSize: 10 }}
                    tickFormatter={value =>
                      value >= 1000000
                        ? `${(value / 1000000).toFixed(1)}M`
                        : value >= 1000
                        ? `${(value / 1000).toFixed(0)}k`
                        : value
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#13131c',
                      borderColor: '#ffffff20',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                    formatter={(value: any) => [value.toLocaleString(), 'EXP']}
                    labelFormatter={(label) => `Lv ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="exp"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#expGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Editable Data Table with Virtual Scroll */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[500px]">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-indigo-400" />
                EXP Data Grid
              </h3>
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-black/25">
              {/* Header Row */}
              <div className="flex items-center text-xs font-semibold text-gray-400 bg-black/40 border-b border-white/10 px-5 py-3 sticky top-0 z-10">
                <div className="w-16 shrink-0">{t('exp_table_editor.level')}</div>
                <div className="flex-1 px-4">{t('exp_table_editor.exp_required')}</div>
                <div className="w-28 shrink-0 text-right">{t('exp_table_editor.delta')}</div>
              </div>

              {/* Virtualized Rows */}
              <Virtuoso
                style={{ height: '100%' }}
                data={chartData}
                itemContent={(index, row) => (
                  <div className="flex items-center text-xs text-gray-300 border-b border-white/5 hover:bg-white/5 transition-all px-5 py-2">
                    {/* Level */}
                    <div className="w-16 shrink-0 font-bold text-indigo-300">Lv {row.level}</div>
                    
                    {/* Value Input */}
                    <div className="flex-1 px-4">
                      <input
                        type="number"
                        value={row.exp}
                        onChange={e => handleValueChange(index, parseInt(e.target.value) || 0)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-white font-mono text-xs w-full focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Delta */}
                    <div className="w-28 shrink-0 text-right font-mono text-gray-400">
                      {row.delta > 0 ? `+${row.delta.toLocaleString()}` : row.delta.toLocaleString()}
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
