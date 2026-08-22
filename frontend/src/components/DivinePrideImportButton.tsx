import React, { useState } from 'react';
import axios from 'axios';
import { DownloadCloud, Loader2 } from 'lucide-react';
import { API_URL } from '../config/env';
import { getDivinePrideApiKey } from '../utils/divinePride';
import { useLanguageStore } from '../store/useLanguageStore';
import { toast } from '../store/useToastStore';

export interface DivinePrideImportButtonProps {
  resourceType: 'monster' | 'item' | 'skill';
  resourceId: number | string;
  onImportSuccess: (mappedData: any, rawData?: any) => void;
  className?: string;
}

export const DivinePrideImportButton: React.FC<DivinePrideImportButtonProps> = ({
  resourceType,
  resourceId,
  onImportSuccess,
  className = '',
}) => {
  const t = useLanguageStore((state) => state.t);
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    const apiKey = getDivinePrideApiKey();
    if (!apiKey || !apiKey.trim()) {
      toast.error(t('divinepride.missing_key_alert'));
      return;
    }

    const numericId = Number(resourceId);
    if (!numericId || isNaN(numericId) || numericId <= 0) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/api/divinepride/import/${resourceType}/${numericId}`,
        {
          headers: {
            'x-divine-pride-key': apiKey,
          },
        }
      );

      if (response.data && response.data.mapped) {
        onImportSuccess(response.data.mapped, response.data.raw);
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(t('divinepride.import_error', { message: errorMessage }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled
      title={t('divinepride.maintenance')}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-500/10 text-gray-500 border border-gray-500/20 opacity-50 cursor-not-allowed transition-all shadow-sm ${className}`}
    >
      <DownloadCloud size={13} />
      <span>{t('divinepride.import_button')}</span>
    </button>
  );
};

export default DivinePrideImportButton;
