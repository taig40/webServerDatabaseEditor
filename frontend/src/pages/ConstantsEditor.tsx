import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Plus, Save, Trash2, Database, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';
import { translateApiError } from '../utils/errors';

interface Constant {
  Name: string;
  Value: string | number;
  Parameter?: boolean;
  _source: 'rathena' | 'custom';
  _isNew?: boolean;
}

export const ConstantsEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [constants, setConstants] = useState<Constant[]>([]);
  const [originalList, setOriginalList] = useState<Constant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [searchText, setSearchText] = useState("");

  // Initialize status string after mount with t()
  useEffect(() => {
    setLoadingStatus(t('constants_editor.loading'));
    fetchConstants();
  }, []);

  const fetchConstants = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/constants/`);
      const list = res.data.constants || [];
      setConstants(list);
      setOriginalList(JSON.parse(JSON.stringify(list))); // Deep copy
      setIsLoading(false);
    } catch (err) {
      console.error("Erro ao carregar constantes:", err);
      setLoadingStatus(t('constants_editor.loading_error'));
      setIsLoading(false);
    }
  };

  const filteredConstants = useMemo(() => {
    if (!searchText.trim()) return constants;
    const q = searchText.toLowerCase();
    return constants.filter(c => c.Name.toLowerCase().includes(q));
  }, [constants, searchText]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(constants) !== JSON.stringify(originalList);
  }, [constants, originalList]);

  // Update row values
  const handleUpdateRow = useCallback((indexInFiltered: number, field: keyof Constant, value: any) => {
    const targetItem = filteredConstants[indexInFiltered];
    if (!targetItem) return;

    setConstants(prev => prev.map(c => {
      if (c.Name === targetItem.Name && c._isNew === targetItem._isNew) {
        // Value field handling for numbers/strings
        if (field === 'Value') {
          // If numeric input, convert to number if possible
          const parsed = Number(value);
          const finalVal = (value !== '' && !isNaN(parsed)) ? parsed : value;
          return { ...c, [field]: finalVal };
        }
        return { ...c, [field]: value };
      }
      return c;
    }));
  }, [filteredConstants]);

  // Delete row
  const handleDeleteRow = useCallback((indexInFiltered: number) => {
    const targetItem = filteredConstants[indexInFiltered];
    if (!targetItem) return;

    if (targetItem._source === 'rathena' && !targetItem._isNew) {
      alert(t('constants_editor.alert_delete_core'));
      return;
    }

    setConstants(prev => prev.filter(c => !(c.Name === targetItem.Name && c._isNew === targetItem._isNew)));
  }, [filteredConstants, t]);

  // Add new row at the top
  const handleAddConstant = () => {
    const newName = `NOVA_CONSTANTE_${Date.now().toString().slice(-4)}`;
    const newConst: Constant = {
      Name: newName,
      Value: 0,
      Parameter: false,
      _source: 'custom',
      _isNew: true
    };
    setConstants(prev => [newConst, ...prev]);
    setSearchText(""); // Clear search to make it visible
  };

  // Save payload
  const handleSave = async () => {
    // Validate names are unique and valid uppercase identifiers
    const names = new Set<string>();
    const reValidName = /^[A-Z][A-Z0-9_]*$/;

    for (const c of constants) {
      const name = c.Name.trim();
      if (!name) {
        alert(t('constants_editor.alert_name_empty'));
        return;
      }
      if (!reValidName.test(name)) {
        alert(t('constants_editor.alert_name_invalid'));
        return;
      }
      if (names.has(name)) {
        alert(t('constants_editor.alert_duplicate', { name }));
        return;
      }
      names.add(name);
    }

    setIsSaving(true);
    try {
      const payload = constants.map(c => ({
        Name: c.Name.trim(),
        Value: c.Value,
        Parameter: !!c.Parameter
      }));

      await axios.put(`${API_URL}/api/constants/`, { constants: payload });
      alert(t('constants_editor.save_success'));
      await fetchConstants();
    } catch (err: any) {
      console.error("Erro ao salvar constantes:", err);
      const errMsg = translateApiError(err?.response?.data?.detail, t) || err.message;
      alert(t('constants_editor.save_error', { error: errMsg }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0f0f14] overflow-hidden font-sans">
      
      {/* Header Panel */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-5 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">{t('constants_editor.title')}</h2>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded">
              const.yml
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t('constants_editor.subtitle')} <span className="font-mono text-gray-400">db/import/const.yml</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isLoading && (
            <span className="text-xs text-gray-600 font-mono animate-pulse">{t('constants_editor.loading')}</span>
          )}
          {hasUnsavedChanges && !isLoading && (
            <span className="text-amber-400 text-xs font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 animate-pulse">
              ● {t('constants_editor.unsaved_changes')}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving || isLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs shadow-lg transition-all cursor-pointer ${
              hasUnsavedChanges && !isLoading
                ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/30'
                : 'bg-[#1a1a28] text-gray-600 border border-white/5 cursor-not-allowed'
            }`}
          >
            <Save size={13} />
            {isSaving ? t('constants_editor.saving_btn') : t('constants_editor.save_btn')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-8">
        {/* Controls Row */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder={t('constants_editor.search_placeholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-[#12121a] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>

          <button
            onClick={handleAddConstant}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-[#1a1a28] hover:bg-[#202035] text-gray-300 hover:text-white border border-white/10 hover:border-violet-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <Plus size={14} className="text-violet-400" />
            {t('constants_editor.new_constant_btn')}
          </button>
        </div>

        {/* Table Body */}
        <div className="flex-1 bg-[#12121a] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-xl">
          {/* Table Header */}
          <div className="flex items-center gap-4 px-6 py-3.5 bg-[#16161f]/80 border-b border-white/5 text-[10px] font-bold text-gray-400 uppercase tracking-wider select-none">
            <div className="flex-1">{t('constants_editor.th_name')}</div>
            <div className="w-64">{t('constants_editor.th_value')}</div>
            <div className="w-28 text-center">{t('constants_editor.th_parameter')}</div>
            <div className="w-28 text-center">{t('constants_editor.th_source')}</div>
            <div className="w-16 text-center">{t('constants_editor.th_actions')}</div>
          </div>

          {/* Virtual List Container */}
          <div className="flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                <RefreshCw size={24} className="animate-spin text-violet-500" />
                <p className="text-xs font-mono">{loadingStatus}</p>
              </div>
            ) : filteredConstants.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 p-8">
                <AlertTriangle size={32} className="mb-2 text-gray-700 animate-bounce" />
                <p className="text-xs font-medium">{t('constants_editor.no_constants')}</p>
                {searchText && <p className="text-[11px] text-gray-700 mt-1">{t('constants_editor.clear_search_hint')}</p>}
              </div>
            ) : (
              <Virtuoso
                data={filteredConstants}
                style={{ height: '100%' }}
                itemContent={(index, item) => {
                  const isCore = item._source === 'rathena' && !item._isNew;
                  return (
                    <div className="flex items-center gap-4 px-6 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors duration-75">
                      {/* Name Column */}
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.Name}
                          disabled={isCore}
                          onChange={(e) => handleUpdateRow(index, 'Name', e.target.value)}
                          placeholder="NOME_DA_CONSTANTE"
                          className={`w-full bg-transparent border-b text-xs font-mono tracking-wide py-1 focus:outline-none transition-colors ${
                            isCore
                              ? 'border-transparent text-gray-500 cursor-not-allowed'
                              : 'border-white/10 hover:border-violet-500/40 focus:border-violet-500 text-violet-300'
                          }`}
                        />
                      </div>

                      {/* Value Column */}
                      <div className="w-64">
                        <input
                          type="text"
                          value={item.Value}
                          onChange={(e) => handleUpdateRow(index, 'Value', e.target.value)}
                          placeholder="Valor (ex: 123 ou TEXT)"
                          className="w-full bg-[#0f0f14] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-violet-500/60"
                        />
                      </div>

                      {/* Parameter Column */}
                      <div className="w-28 flex items-center justify-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!item.Parameter}
                            onChange={(e) => handleUpdateRow(index, 'Parameter', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-dark-900 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-violet-600 peer-checked:after:bg-white"></div>
                        </label>
                      </div>

                      {/* Source Badge */}
                      <div className="w-28 flex items-center justify-center">
                        {item._isNew ? (
                          <span className="text-[9px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded font-mono font-semibold uppercase tracking-wider">
                            {t('constants_editor.badge_new')}
                          </span>
                        ) : item._source === 'custom' ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-semibold uppercase tracking-wider flex items-center gap-1">
                            <Sparkles size={9} /> {t('constants_editor.badge_custom')}
                          </span>
                        ) : (
                          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-semibold uppercase tracking-wider flex items-center gap-0.5">
                            <Database size={9} /> {t('constants_editor.badge_core')}
                          </span>
                        )}
                      </div>

                      {/* Action Column */}
                      <div className="w-16 flex items-center justify-center">
                        <button
                          onClick={() => handleDeleteRow(index)}
                          disabled={isCore}
                          title={isCore ? t('constants_editor.delete_core_disabled') : t('constants_editor.delete_tooltip')}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isCore
                              ? 'text-gray-700 border-transparent cursor-not-allowed'
                              : 'text-gray-500 hover:text-red-400 border-transparent hover:border-red-500/10 hover:bg-red-500/5 cursor-pointer'
                          }`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstantsEditor;
