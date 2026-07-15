import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { Save, AlertCircle } from 'lucide-react';
import { FittingRoom } from './FittingRoom';

interface VisualEquipmentFormProps {
  viewId: number;
  onSyncViewId: (newViewId: number) => void;
  initialResourceName?: string;
}

export const VisualEquipmentForm: React.FC<VisualEquipmentFormProps> = ({ viewId, onSyncViewId, initialResourceName }) => {
  const t = useLanguageStore((state) => state.t);
  
  const [identity, setIdentity] = useState('');
  const [name, setName] = useState('');
  const [currentViewId, setCurrentViewId] = useState(viewId);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Debounced resource name to prevent excessive API calls to visualizer
  const [debouncedName, setDebouncedName] = useState(name);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(name);
    }, 500);
    return () => clearTimeout(timer);
  }, [name]);

  useEffect(() => {
    setCurrentViewId(viewId);
    
    if (viewId === 0) {
      setIdentity('');
      setName(initialResourceName || '');
      return;
    }

    const fetchVisual = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/client_items/visuals/${viewId}`);
        setIdentity(res.data.identity || '');
        setName(res.data.name || initialResourceName || '');
      } catch (err) {
        console.error('Failed to load visual data:', err);
      }
    };
    
    fetchVisual();
  }, [viewId]);

  const handleSave = async () => {
    if (currentViewId <= 0) {
      setMessage({ text: t('visual_equipment.invalid_view_id' as any) || 'Invalid View ID.', type: 'error' });
      return;
    }
    
    if (!identity.trim() || !name.trim()) {
      setMessage({ text: t('visual_equipment.missing_fields' as any) || 'Identity and Name are required.', type: 'error' });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      await axios.put(`${API_URL}/api/client_items/visuals/${currentViewId}`, {
        identity: identity.trim(),
        name: name.trim()
      });
      
      setMessage({ text: t('visual_equipment.save_success' as any) || 'Visual equipment saved successfully!', type: 'success' });
      
      // Sync up if the View ID was changed
      if (currentViewId !== viewId) {
        onSyncViewId(currentViewId);
      }
    } catch (err) {
      console.error('Save visual error:', err);
      setMessage({ text: t('visual_equipment.save_error' as any) || 'Failed to save visual equipment.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0f] p-8 h-full">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Form) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#12121a] rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {t('visual_equipment.title' as any) || 'Visual Configuration'}
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">View ID (ClassNum)</label>
                <input
                  type="number"
                  value={currentViewId}
                  onChange={(e) => setCurrentViewId(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="Ex: 2000"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Identity (accessoryid.lua)</label>
                <input
                  type="text"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="Ex: ACCESSORY_CustomWings"
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-400">Sprite Name (accname.lua) / Resource Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="Ex: _CustomWings"
                />
              </div>
            </div>
            
            {message && (
              <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{message.text}</p>
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {isSaving ? (t('common.saving' as any) || 'Saving...') : (t('common.save' as any) || 'Save Configuration')}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (Fitting Room + Info) */}
        <div className="space-y-6">
          <FittingRoom
            resourceName={debouncedName}
            onSelectAccessory={(spriteName, selectedViewId, selectedConstant) => {
              setName(spriteName);
              setCurrentViewId(selectedViewId);
              setIdentity(selectedConstant);
            }}
          />

          <div className="bg-[#12121a] rounded-2xl border border-white/5 p-6 opacity-60">
             <h3 className="text-sm font-semibold text-gray-300 mb-2">How it works</h3>
             <p className="text-xs text-gray-400 leading-relaxed">
               This module edits <code>accessoryid.lua</code> and <code>accname.lua</code> directly. The server automatically tries to preserve the native CP949 encoding required by the RO Client. If you change the <strong>View ID</strong> here and save, the Basic Information tab will be automatically synchronized.
             </p>
          </div>
        </div>

      </div>
    </div>
  );
};
