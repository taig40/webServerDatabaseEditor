import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Search, DownloadCloud, Loader2, AlertCircle, Code2, Save } from 'lucide-react';
import { API_URL } from '../config/env';
import { getDivinePrideApiKey } from '../utils/divinePride';
import { useLanguageStore } from '../store/useLanguageStore';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface DivinePrideImporterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'item' | 'monster' | 'skill';
  onImportSuccess: (mappedData: any) => void;
}

export const DivinePrideImporterPanel: React.FC<DivinePrideImporterPanelProps> = ({
  isOpen,
  onClose,
  resourceType,
  onImportSuccess
}) => {
  const t = useLanguageStore((state) => state.t);
  
  const [dpId, setDpId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ mapped: any, yaml_preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear state when opened/closed
  useEffect(() => {
    if (isOpen) {
      setDpId('');
      setPreviewData(null);
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFetch = async () => {
    const apiKey = getDivinePrideApiKey();
    if (!apiKey || !apiKey.trim()) {
      setError(t('divinepride.missing_key_alert'));
      return;
    }

    const numericId = parseInt(dpId, 10);
    if (!numericId || isNaN(numericId) || numericId <= 0) {
      setError("ID Inválido");
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreviewData(null);

    try {
      const response = await axios.get(
        `${API_URL}/api/divinepride/preview/${resourceType}/${numericId}`,
        {
          headers: {
            'x-divine-pride-key': apiKey,
          },
        }
      );

      if (response.data && response.data.mapped) {
        setPreviewData({
          mapped: response.data.mapped,
          yaml_preview: response.data.yaml_preview || 'Sem preview disponível'
        });
      } else {
        setError("Retorno inválido da API.");
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error';
      setError(t('divinepride.panel_fetch_error', { message: errorMessage }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = () => {
    if (previewData && previewData.mapped) {
      onImportSuccess(previewData.mapped);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0b0b12] border border-gray-800 rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[80vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
              <DownloadCloud className="w-5 h-5" />
              {t('divinepride.panel_title')}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {t('divinepride.panel_subtitle')}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Split View */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          
          {/* Left Column - Input */}
          <div className="w-1/3 p-6 border-r border-gray-800 bg-[#12121a] flex flex-col gap-6">
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                {t('divinepride.panel_id_label')} ({resourceType === 'monster' ? t('divinepride.panel_resource_monster') : t('divinepride.panel_resource_item')})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={dpId}
                  onChange={(e) => setDpId(e.target.value)}
                  placeholder={t('divinepride.panel_id_placeholder')}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                  className="flex-1 bg-[#0b0b12] border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                />
                <button
                  onClick={handleFetch}
                  disabled={isLoading || !dpId}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {t('divinepride.panel_fetch')}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg flex items-start gap-3 text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {previewData && (
              <div className="mt-4 p-4 bg-emerald-900/20 border border-emerald-800/30 rounded-lg">
                <h3 className="text-emerald-400 font-medium text-sm mb-2">Importação Encontrada</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li><strong>ID:</strong> {previewData.mapped.Id}</li>
                  <li><strong>Nome:</strong> {previewData.mapped.Name}</li>
                  <li><strong>AegisName:</strong> {previewData.mapped.AegisName}</li>
                </ul>
              </div>
            )}

          </div>

          {/* Right Column - Live Preview */}
          <div className="w-2/3 flex flex-col bg-[#0b0b12]">
            <div className="p-3 border-b border-gray-800 bg-gray-900/30 flex items-center gap-2 text-sm font-medium text-gray-400">
              <Code2 className="w-4 h-4" />
              {t('divinepride.panel_preview_title')}
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar relative p-4">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center text-emerald-500">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="font-medium">{t('divinepride.panel_fetching')}</span>
                  </div>
                </div>
              ) : previewData ? (
                <SyntaxHighlighter
                  language="yaml"
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '0.875rem' }}
                >
                  {previewData.yaml_preview}
                </SyntaxHighlighter>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                  {t('divinepride.panel_preview_empty')}
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t('divinepride.panel_cancel')}
              </button>
              <button
                onClick={handleApprove}
                disabled={!previewData || isLoading}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
              >
                <Save className="w-4 h-4" />
                {t('divinepride.panel_save')}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
