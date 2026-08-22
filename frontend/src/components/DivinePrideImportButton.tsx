import React from 'react';
import { DownloadCloud } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';

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

  return (
    <button
      type="button"
      disabled
      title={t('divinepride.maintenance' as any)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-500/10 text-gray-500 border border-gray-500/20 opacity-50 cursor-not-allowed transition-all shadow-sm ${className}`}
    >
      <DownloadCloud size={13} />
      <span>{t('divinepride.import_button' as any)}</span>
    </button>
  );
};

export default DivinePrideImportButton;
