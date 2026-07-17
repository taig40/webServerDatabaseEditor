import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { Save, AlertCircle } from 'lucide-react';
import { FittingRoom } from './FittingRoom';
import { Trans } from './Trans';

interface VisualEquipmentFormProps {
  itemId: number;
  viewId: number;
  onSyncViewId: (newViewId: number) => void;
  initialResourceName?: string;
}

export const VisualEquipmentForm: React.FC<VisualEquipmentFormProps> = ({ itemId, viewId, onSyncViewId, initialResourceName }) => {
  const t = useLanguageStore((state) => state.t);
  
  const [identity, setIdentity] = useState('');
  const [name, setName] = useState('');
  const [equipmentType, setEquipmentType] = useState<'headgear' | 'garment'>('headgear');
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
        const res = await axios.get(`${API_URL}/api/client_items/visuals/${viewId}?item_id=${itemId}`);
        const fetchedIdentity = res.data.identity || '';
        const fetchedName = res.data.name || '';
        const fetchedType = res.data.type || '';
        
        setIdentity(fetchedIdentity);
        setName(fetchedName || initialResourceName || '');
        
        if (fetchedType === 'garment') {
          setEquipmentType('garment');
        } else if (fetchedType === 'headgear') {
          setEquipmentType('headgear');
        } else {
          if (!fetchedIdentity && !fetchedName) {
            setEquipmentType('garment');
          } else {
            setEquipmentType('headgear');
          }
        }
      } catch (err) {
        console.error('Failed to load visual data:', err);
        setEquipmentType('garment');
      }
    };
    
    fetchVisual();
  }, [viewId, initialResourceName, itemId]);

  const fetchVisualForType = async (typeHint: 'headgear' | 'garment') => {
    if (currentViewId <= 0) return;
    try {
      const res = await axios.get(`${API_URL}/api/client_items/visuals/${currentViewId}?item_id=${itemId}&type_hint=${typeHint}`);
      setIdentity(res.data.identity || '');
      setName(res.data.name || initialResourceName || '');
      setEquipmentType(typeHint);
    } catch (err) {
      console.error('Failed to load visual data for type:', err);
      setEquipmentType(typeHint);
    }
  };

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
                  data-testid="input-viewid"
                  type="number"
                  value={currentViewId}
                  onChange={(e) => setCurrentViewId(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder={t('visual_equipment.view_id_placeholder' as any) || 'Ex: 2000'}
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-400">{t('visual_equipment.equipment_type' as any) || 'Equipment Type'}</label>
                <select
                  value={equipmentType}
                  onChange={(e) => {
                    const newType = e.target.value as 'headgear' | 'garment';
                    fetchVisualForType(newType);
                  }}
                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                >
                  <option value="headgear">{t('visual_equipment.headgear' as any) || 'Headgear / Accessory'}</option>
                  <option value="garment">{t('visual_equipment.garment' as any) || 'Garment / Robe'}</option>
                </select>
              </div>
              
              {equipmentType === 'headgear' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-400">{t('visual_equipment.identity_label' as any) || 'Identity (accessoryid.lua)'}</label>
                    <input
                      type="text"
                      value={identity}
                      onChange={(e) => setIdentity(e.target.value)}
                      className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                      placeholder={t('visual_equipment.identity_placeholder' as any) || 'Ex: ACCESSORY_CustomWings'}
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-400">{t('visual_equipment.sprite_name_label' as any) || 'Sprite Name (accname.lua) / Resource Name'}</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                      placeholder={t('visual_equipment.sprite_name_placeholder' as any) || 'Ex: _CustomWings'}
                    />
                  </div>
                </>
              )}
            </div>
            
            {equipmentType === 'garment' && (
              <div className="mt-4 p-4 rounded-xl flex items-start gap-3 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed text-blue-300">
                  <Trans text={t('visual_equipment.garment_alert' as any) || 'Garment (Robe) sprites are managed via <code>spriterobename.lua</code> directly in your client files. Saving from this tool is only supported for Headgears. You can still use the Fitting Room on the right to preview the Robe by typing its name.'} />
                </div>
              </div>
            )}
            
            {message && (
              <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{message.text}</p>
              </div>
            )}

            {equipmentType === 'headgear' && (
              <div className="flex gap-4 mt-8">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]"
                >
                  <Save size={18} />
                  {isSaving ? (t('common.saving' as any) || 'Saving...') : (t('client_item_editor.save_visual' as any) || 'Save Visual Identity')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Fitting Room + Info) */}
        <div className="space-y-6">
          <FittingRoom
            resourceName={debouncedName}
            equipmentType={equipmentType}
            onSelectAccessory={(spriteName, selectedViewId, selectedConstant) => {
              setName(spriteName);
              setCurrentViewId(selectedViewId);
              setIdentity(selectedConstant);
            }}
          />

          <div className="bg-[#12121a] rounded-2xl border border-white/5 p-6 opacity-60">
             <h3 className="text-sm font-semibold text-gray-300 mb-2">{t('visual_equipment.how_it_works')}</h3>
             <p className="text-xs text-gray-400 leading-relaxed">
               <Trans text={t('visual_equipment.how_it_works_desc')} />
             </p>
          </div>
        </div>

      </div>
    </div>
  );
};
