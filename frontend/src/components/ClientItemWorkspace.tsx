import React, { useState } from 'react';
import ClientItemDetail from './ClientItemDetail';
import { VisualEquipmentForm } from './VisualEquipmentForm';
import { useLanguageStore } from '../store/useLanguageStore';
import { LayoutList, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

interface ClientItemWorkspaceProps {
  item: any;
  onSave: (itemId: number, fields: Record<string, any>) => Promise<boolean>;
  onLocalItemUpdate: (itemId: number, newClassNum: number) => void;
  mode?: 'edit' | 'create';
  onCreate?: (itemId: number, fields: Record<string, any>) => Promise<boolean>;
  onDelete?: (itemId: number) => Promise<boolean>;
}

export const ClientItemWorkspace: React.FC<ClientItemWorkspaceProps> = ({ item, onSave, onLocalItemUpdate, mode = 'edit', onCreate, onDelete }) => {
  const t = useLanguageStore((state) => state.t);
  const [activeTab, setActiveTab] = useState<'basic' | 'visual'>('basic');
  const [toast, setToast] = useState<string | null>(null);

  // Sync state between Visual form and Basic info
  const handleSyncViewId = async (newViewId: number) => {
    // Silent PUT to update the iteminfo.lua
    try {
      const updatedFields = { ...item, ClassNum: newViewId };
      const success = await onSave(item.Id, updatedFields);
      
      if (success) {
        onLocalItemUpdate(item.Id, newViewId);
        setToast(`ClassNum do Item atualizado automaticamente para ${newViewId}`);
        setTimeout(() => setToast(null), 4000);
      }
    } catch (e) {
      console.error('Failed silent PUT on sync', e);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0f0f14] relative">
      
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl shadow-lg shadow-black/50 animate-in slide-in-from-top-2 fade-in duration-300">
          <CheckCircle2 size={18} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Workspace Tabs */}
      <div className="flex-shrink-0 flex items-center px-6 h-14 bg-[#12121a] border-b border-white/5 gap-2">
        <button
          onClick={() => setActiveTab('basic')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'basic' 
              ? 'bg-white/10 text-white' 
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
        >
          <LayoutList size={16} />
          {t('client_item_editor.tabs.basic' as any) || 'Informações Básicas'}
        </button>
        <button
          onClick={() => setActiveTab('visual')}
          disabled={mode === 'create'}
          title={mode === 'create' ? (t('client_item_editor.visual_disabled_hint' as any) || 'Salve o item primeiro') : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'create'
              ? 'text-gray-700 cursor-not-allowed opacity-50'
              : activeTab === 'visual' 
                ? 'bg-white/10 text-white' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
        >
          <ImageIcon size={16} />
          {t('client_item_editor.tabs.visual' as any) || 'Configuração Visual'}
        </button>
      </div>
      
      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'basic' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          <ClientItemDetail item={item} onSave={onSave} isNew={mode === 'create'} onCreate={onCreate} onDelete={onDelete} />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'visual' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          {mode === 'create' ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
              <ImageIcon size={48} className="opacity-20" />
              <p className="text-sm text-center max-w-xs leading-relaxed">
                {t('client_item_editor.visual_disabled_hint' as any) || 'Salve o item primeiro para configurar o Visual Equipment.'}
              </p>
            </div>
          ) : (
            <VisualEquipmentForm 
              viewId={item?.ClassNum || 0} 
              onSyncViewId={handleSyncViewId}
              initialResourceName={item?.identifiedResourceName || item?.unIdentifiedResourceName || ''}
            />
          )}
        </div>
      </div>
    </div>
  );
};
