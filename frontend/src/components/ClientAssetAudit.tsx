import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { Search, Play, Loader2, Edit3, CheckCircle, AlertTriangle } from 'lucide-react';

interface AuditResult {
  Id: number;
  Name: string;
  ResourceName: string;
  Missing: string[];
}

interface ClientAssetAuditProps {
  onOpenItem: (id: number) => void;
}

export const ClientAssetAudit: React.FC<ClientAssetAuditProps> = ({ onOpenItem }) => {
  const t = useLanguageStore(state => state.t);
  
  const [results, setResults] = useState<AuditResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(200);

  const handleScan = async () => {
    try {
      setIsScanning(true);
      setError(null);
      setHasScanned(false);
      const res = await axios.get(`${API_URL}/api/client_items/audit-assets`);
      setResults(res.data || []);
      setIsScanning(false);
      setHasScanned(true);
    } catch (err: any) {
      console.error('Error running assets audit:', err);
      setIsScanning(false);
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (detail && typeof detail === 'object' && detail.message) {
        setError(detail.message);
      } else {
        setError(t('common.error') || 'Erro ao executar a auditoria de assets. Verifique se o servidor backend está ativo e configurado corretamente.');
      }
    }
  };

  const decodeLatin1ToEucKr = (str: string) => {
    try {
      const bytes = new Uint8Array(str.split('').map(c => c.charCodeAt(0)));
      return new TextDecoder('euc-kr').decode(bytes);
    } catch {
      return str;
    }
  };

  const filteredResults = useMemo(() => {
    let list = results;
    if (onlyCustom) {
      list = list.filter(r => r.Id >= 20000);
    }
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(
      r =>
        String(r.Id).includes(q) ||
        (r.Name && r.Name.toLowerCase().includes(q)) ||
        (r.ResourceName && r.ResourceName.toLowerCase().includes(q))
    );
  }, [results, onlyCustom, searchText]);

  const slicedResults = useMemo(() => {
    return filteredResults.slice(0, displayLimit);
  }, [filteredResults, displayLimit]);

  useEffect(() => {
    setDisplayLimit(200);
  }, [searchText, onlyCustom, results]);

  return (
    <div className="flex-1 flex flex-col bg-[#0f0f14] overflow-hidden p-8">
      
      {/* ── Control Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#13131f] border border-white/5 p-6 rounded-2xl shadow-xl mb-6 flex-shrink-0">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            {t('components.client_item_audit.tab_audit')}
          </h2>
          <p className="text-xs text-gray-500">
            {t('components.client_item_audit.scanning') || 'Verifique a integridade dos sprites e texturas dos itens do client.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isScanning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            {t('components.client_item_audit.scan_btn')}
          </button>
        </div>
      </div>

      {/* ── Filter & Search Bar ────────────────────────────────────────── */}
      {hasScanned && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 flex-shrink-0">
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar por ID ou recurso..."
              className="w-full bg-[#13131f] border border-white/5 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyCustom}
              onChange={e => setOnlyCustom(e.target.checked)}
              className="rounded bg-[#13131f] border-white/10 text-cyan-600 focus:ring-cyan-500 focus:ring-opacity-25"
            />
            <span>Apenas Itens Customizados (ID &ge; 20000)</span>
          </label>
        </div>
      )}

      {/* ── Table / Grid View ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-[#13131f] rounded-2xl border border-white/5 shadow-xl flex flex-col overflow-hidden">
        
        {error && (
          <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-3 p-6 text-center">
            <AlertTriangle size={48} className="text-red-500" />
            <h3 className="text-sm font-bold text-white">Falha na Auditoria</h3>
            <p className="text-xs text-gray-400 max-w-md">
              {error}
            </p>
            <button
              onClick={handleScan}
              className="mt-2 px-4 py-2 rounded bg-red-950/30 border border-red-500/30 text-red-200 hover:bg-red-900/40 text-xs transition-colors cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {!hasScanned && !isScanning && !error && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <AlertTriangle size={48} className="text-gray-800" />
            <p className="text-xs text-gray-500 max-w-xs text-center">
              Clique no botão superior para escanear a integridade dos assets do cliente.
            </p>
          </div>
        )}

        {isScanning && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <Loader2 size={36} className="animate-spin text-cyan-500" />
            <p className="text-xs text-gray-500">
              Escaneando tabelas de recursos e arquivos de texturas...
            </p>
          </div>
        )}

        {hasScanned && !isScanning && !error && (
          <>
            {filteredResults.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
                <CheckCircle size={48} className="text-emerald-500/30" />
                <p className="text-xs text-emerald-400 font-medium">
                  {t('components.client_item_audit.clean')}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-between">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-gray-500 font-bold border-b border-white/5 uppercase tracking-wider text-[10px] sticky top-0 bg-[#13131f] z-10">
                        <th className="py-3 px-4 w-20">{t('components.client_item_audit.id')}</th>
                        <th className="py-3 px-4 w-1/4">{t('components.client_item_audit.name')}</th>
                        <th className="py-3 px-4 w-1/4">{t('components.client_item_audit.res_name')}</th>
                        <th className="py-3 px-4">{t('components.client_item_audit.missing')}</th>
                        <th className="py-3 px-4 text-center w-20">{t('components.client_item_audit.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {slicedResults.map((item) => {
                        const decodedRes = decodeLatin1ToEucKr(item.ResourceName);
                        return (
                          <tr key={item.Id} className="hover:bg-white/[0.01] transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-gray-400">{item.Id}</td>
                            <td className="py-3 px-4 font-semibold text-gray-200">{item.Name}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-gray-400">
                              <span className="text-gray-500 block text-[10px]">{item.ResourceName}</span>
                              <span className="text-cyan-400 block text-[12px]">{decodedRes}</span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1.5">
                                {item.Missing.includes('icon') && (
                                  <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                                    {t('components.client_item_audit.badge_icon')}
                                  </span>
                                )}
                                {item.Missing.includes('collection') && (
                                  <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                                    {t('components.client_item_audit.badge_collection')}
                                  </span>
                                )}
                                {item.Missing.includes('spr') && (
                                  <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                                    {t('components.client_item_audit.badge_spr')}
                                  </span>
                                )}
                                {item.Missing.includes('act') && (
                                  <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                                    {t('components.client_item_audit.badge_act')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => onOpenItem(item.Id)}
                                title={t('components.client_item_audit.edit_tooltip')}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-all cursor-pointer inline-flex items-center justify-center"
                              >
                                <Edit3 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredResults.length > displayLimit && (
                  <div className="p-4 bg-[#13131f] flex flex-col items-center justify-center gap-2 border-t border-white/5">
                    <p className="text-xs text-gray-400">
                      Exibindo {displayLimit} de {filteredResults.length} itens.
                    </p>
                    <button
                      onClick={() => setDisplayLimit(prev => prev + 200)}
                      className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Carregar Mais 200 Itens
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Summary Footer */}
            {filteredResults.length > 0 && (
              <div className="p-4 border-t border-white/5 bg-[#0b0b12] flex-shrink-0 flex items-center justify-between text-xs text-gray-500 font-mono">
                <span>
                  {t('components.client_item_audit.results_count', { count: filteredResults.length })}
                </span>
              </div>
            )}
          </>
        )}

      </div>

    </div>
  );
};

export default ClientAssetAudit;
