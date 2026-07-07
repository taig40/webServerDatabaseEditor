import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { Save, Loader2, Scale } from 'lucide-react';

interface SizeFixEntry {
  Weapon: string;
  Small: number;
  Medium: number;
  Large: number;
}

export const SizeFixMatrix: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  
  const [matrix, setMatrix] = useState<SizeFixEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchMatrix();
  }, []);

  const fetchMatrix = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/server/sizefix`);
      setMatrix(res.data || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching size fixes:', err);
      setIsLoading(false);
    }
  };

  const handleValueChange = (weapon: string, size: 'Small' | 'Medium' | 'Large', val: number) => {
    setMatrix(prev =>
      prev.map(item =>
        item.Weapon === weapon ? { ...item, [size]: val } : item
      )
    );
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      await axios.put(`${API_URL}/api/server/sizefix`, {
        matrix: matrix
      });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving size fixes:', err);
      setIsSaving(false);
    }
  };

  // Helper function to color cells based on penalty/buff
  const getCellClass = (val: number) => {
    const base = "w-full text-center bg-[#0a0a0f] border rounded-xl py-2 px-3 text-xs font-mono transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ";
    if (val < 100) {
      return base + "text-amber-400 border-amber-500/30 bg-amber-500/5 focus:border-amber-400";
    } else if (val > 100) {
      return base + "text-emerald-400 border-emerald-500/30 bg-emerald-500/5 focus:border-emerald-400";
    } else {
      return base + "text-gray-400 border-white/10 focus:border-cyan-500/50";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-gray-500 bg-[#0f0f14]">
        <Loader2 size={20} className="animate-spin text-cyan-400" />
        <span className="text-sm font-medium">{t('common.loading') || 'Carregando...'}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f14] text-gray-200 overflow-y-auto">
      
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Scale size={20} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">
              {t('components.size_fix_editor.title') || 'Penalidades de Tamanho'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('components.size_fix_editor.subtitle') || 'Ajuste a modificação de dano das armas de acordo com o tamanho do monstro.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-green-400 font-medium animate-pulse">
              {t('components.size_fix_editor.saved_toast') || '✓ Salvo com sucesso!'}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            {t('components.size_fix_editor.save_btn') || 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* ── Content Grid / Matrix Table ─────────────────────────────────── */}
      <div className="p-8 max-w-4xl w-full mx-auto flex-1">
        <div className="bg-[#13131f] rounded-2xl border border-white/5 p-6 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-gray-500 font-bold border-b border-white/5 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 pl-4 w-1/3">{t('components.size_fix_editor.weapon_header') || 'Tipo de Arma'}</th>
                  <th className="pb-3 text-center w-1/5">{t('components.size_fix_editor.small_header') || 'Pequeno (Small)'}</th>
                  <th className="pb-3 text-center w-1/5">{t('components.size_fix_editor.medium_header') || 'Médio (Medium)'}</th>
                  <th className="pb-3 text-center w-1/5">{t('components.size_fix_editor.large_header') || 'Grande (Large)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {matrix.map((row) => (
                  <tr key={row.Weapon} className="hover:bg-white/[0.01] transition-colors">
                    <td className="py-3 pl-4 font-semibold text-gray-300 font-mono text-[13px]">
                      {row.Weapon}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center max-w-[120px] mx-auto relative">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={row.Small}
                          onChange={e => handleValueChange(row.Weapon, 'Small', parseInt(e.target.value) || 0)}
                          className={getCellClass(row.Small)}
                        />
                        <span className="absolute right-3 text-[10px] text-gray-600 pointer-events-none font-mono">%</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center max-w-[120px] mx-auto relative">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={row.Medium}
                          onChange={e => handleValueChange(row.Weapon, 'Medium', parseInt(e.target.value) || 0)}
                          className={getCellClass(row.Medium)}
                        />
                        <span className="absolute right-3 text-[10px] text-gray-600 pointer-events-none font-mono">%</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center max-w-[120px] mx-auto relative">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={row.Large}
                          onChange={e => handleValueChange(row.Weapon, 'Large', parseInt(e.target.value) || 0)}
                          className={getCellClass(row.Large)}
                        />
                        <span className="absolute right-3 text-[10px] text-gray-600 pointer-events-none font-mono">%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
};

export default SizeFixMatrix;
