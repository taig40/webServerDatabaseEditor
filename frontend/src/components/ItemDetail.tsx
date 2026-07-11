import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Shield, Sword, Box, Save, Plus, X, Users, Store, DownloadCloud, Loader2, AlertCircle } from 'lucide-react';
import { API_URL } from '../config/env';
import Editor from '@monaco-editor/react';
import { initRathenaItemScript, validateItemScript } from '../monaco/rathenaItemScript';
import NpcShopModal from './NpcShopModal';
import { ItemIcon } from './ItemIcon';
import { useLanguageStore } from '../store/useLanguageStore';
import { DivinePrideImportButton } from './DivinePrideImportButton';
import Select from 'react-select';

const LOCATION_OPTIONS = [
  'Head_Top', 'Head_Mid', 'Head_Low', 'Armor', 'Right_Hand', 'Left_Hand', 'Garment', 
  'Shoes', 'Right_Accessory', 'Left_Accessory', 'Costume_Head_Top', 'Costume_Head_Mid', 
  'Costume_Head_Low', 'Costume_Garment', 'Ammo', 'Shadow_Armor', 'Shadow_Weapon', 
  'Shadow_Shield', 'Shadow_Shoes', 'Shadow_Right_Accessory', 'Shadow_Left_Accessory', 
  'Both_Hand', 'Both_Accessory'
].map(l => ({ value: l, label: l }));

const JOB_OPTIONS = [
  'All', 'Acolyte', 'Alchemist', 'Archer', 'Assassin', 'BardDancer', 'Blacksmith', 
  'Crusader', 'Gunslinger', 'Hunter', 'KagerouOboro', 'Knight', 'Mage', 'Merchant', 
  'Monk', 'Ninja', 'Novice', 'Priest', 'Rebellion', 'Rogue', 'Sage', 'SoulLinker', 
  'StarGladiator', 'Summoner', 'SuperNovice', 'Swordman', 'Taekwon', 'Thief', 'Wizard'
].map(j => ({ value: j, label: j }));

const customSelectStyles = {
  control: (base: any) => ({
    ...base,
    backgroundColor: '#111827',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#e5e7eb',
    minHeight: '38px',
    boxShadow: 'none',
    '&:hover': { borderColor: 'rgba(255, 255, 255, 0.2)' }
  }),
  menu: (base: any) => ({
    ...base,
    backgroundColor: '#1f2937',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  }),
  menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused ? '#374151' : 'transparent',
    color: '#e5e7eb',
    cursor: 'pointer',
    '&:active': { backgroundColor: '#4b5563' }
  }),
  singleValue: (base: any) => ({ ...base, color: '#e5e7eb' }),
  multiValue: (base: any) => ({ ...base, backgroundColor: '#374151', borderRadius: '4px' }),
  multiValueLabel: (base: any) => ({ ...base, color: '#e5e7eb' }),
  multiValueRemove: (base: any) => ({
    ...base,
    color: '#9ca3af',
    '&:hover': { backgroundColor: '#ef4444', color: 'white' }
  }),
  input: (base: any) => ({ ...base, color: '#e5e7eb' }),
};

interface ItemDetailProps {
  item: any;
  onUpdate: (itemId: number, updatedData: any, saveMode?: 'import' | 'overwrite') => Promise<boolean | void>;
}

const ItemDetail: React.FC<ItemDetailProps> = ({ item, onUpdate }) => {
  const t = useLanguageStore(state => state.t);
  const [drops, setDrops] = useState<any[]>([]);
  const [soldBy, setSoldBy] = useState<any[]>([]);
  const [isLoadingDrops, setIsLoadingDrops] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [localItem, setLocalItem] = useState(item);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dpMessage, setDpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDPImportSuccess = (mappedData: any) => {
    setLocalItem((prev: any) => ({
      ...prev,
      ...mappedData,
      Id: item.Id
    }));
    setDpMessage({ type: 'success', text: t('divinepride.import_success') });
    setTimeout(() => setDpMessage(null), 6000);
  };

  useEffect(() => {
    setLocalItem(item);
    
    // Fetch drops for this item
    const fetchDrops = async () => {
      setIsLoadingDrops(true);
      try {
        const res = await axios.get(`${API_URL}/api/items/${item.Id}/dropped_by`);
        setDrops(res.data);
      } catch (err) {
        console.error("Erro ao buscar drops:", err);
      } finally {
        setIsLoadingDrops(false);
      }
    };
    
    const fetchSoldBy = async () => {
      setIsLoadingShops(true);
      try {
        const res = await axios.get(`${API_URL}/api/items/${item.Id}/sold_by`);
        setSoldBy(res.data);
      } catch (err) {
        console.error("Erro ao buscar lojas:", err);
      } finally {
        setIsLoadingShops(false);
      }
    };
    
    fetchDrops();
    fetchSoldBy();
  }, [item.Id]);

  const handleFieldChange = (field: string, val: any, isNumber = false) => {
    let parsed = val;
    if (isNumber) {
      parsed = val === '' ? null : Number(val);
    }
    setLocalItem((prev: any) => ({ ...prev, [field]: parsed }));
  };

  const getScriptString = (scriptObj: any) => {
    if (!scriptObj) return '';
    if (typeof scriptObj === 'string') return scriptObj;
    return scriptObj.Script || '';
  };

  const isModified = JSON.stringify(localItem) !== JSON.stringify(item);

  const handleSaveClick = () => {
    if (!isModified) return;
    if (item._source === 'rathena') {
      setShowSaveModal(true);
    } else {
      executeSave('import');
    }
  };

  const executeSave = async (mode: 'import' | 'overwrite') => {
    setIsSaving(true);
    setShowSaveModal(false);
    try {
      await onUpdate(item.Id, localItem, mode);
    } finally {
      setIsSaving(false);
    }
  };

  const getJobsValue = () => {
    if (!localItem.Jobs) return [];
    if (localItem.Jobs.All) return [{ value: 'All', label: 'All' }];
    return Object.entries(localItem.Jobs)
      .filter(([_, v]) => v === true)
      .map(([k, _]) => ({ value: k, label: k }));
  };

  const handleJobsChange = (selected: any) => {
    if (!selected || selected.length === 0) {
      handleFieldChange('Jobs', null);
      return;
    }
    const hasAll = selected.find((o: any) => o.value === 'All');
    if (hasAll) {
      handleFieldChange('Jobs', { All: true });
      return;
    }
    const jobsMap: any = {};
    selected.forEach((o: any) => { jobsMap[o.value] = true; });
    handleFieldChange('Jobs', jobsMap);
  };

  const getLocationsValue = () => {
    if (!localItem.Locations) return [];
    return Object.entries(localItem.Locations)
      .filter(([_, v]) => v === true)
      .map(([k, _]) => ({ value: k, label: k }));
  };

  const handleLocationsChange = (selected: any) => {
    if (!selected || selected.length === 0) {
      handleFieldChange('Locations', null);
      return;
    }
    const locMap: any = {};
    selected.forEach((o: any) => { locMap[o.value] = true; });
    handleFieldChange('Locations', locMap);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-dark-900 text-gray-200">
      
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-transparent">
        <div className="flex items-center">
          <div className="w-16 h-16 rounded-xl bg-dark-800 border border-white/10 flex items-center justify-center shadow-lg p-2 mr-6">
            <ItemIcon itemId={localItem.Id} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-1">{localItem.Name || t('item_detail.unnamed')}</h2>
            <div className="flex items-center gap-3 text-sm font-mono text-gray-400 flex-wrap">
              <span className="flex items-center gap-1.5 bg-dark-800 px-2 py-0.5 rounded border border-white/10">
                <span>ID: <span className="text-violet-400">{localItem.Id}</span></span>
                <DivinePrideImportButton
                  resourceType="item"
                  resourceId={localItem.Id}
                  onImportSuccess={handleDPImportSuccess}
                />
              </span>
              <span className="flex items-center gap-1 bg-dark-800 px-2 py-0.5 rounded border border-white/10">
                AegisName: 
                <input
                  type="text"
                  value={localItem.AegisName || ''}
                  onChange={e => handleFieldChange('AegisName', e.target.value)}
                  className="bg-transparent text-blue-400 font-mono focus:outline-none focus:border-b focus:border-blue-500/50 w-40"
                  placeholder="AegisName"
                />
              </span>
            </div>
            {dpMessage && (
              <div className={`mt-2 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
                dpMessage.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                  : 'bg-red-950/80 border-red-700/60 text-red-300'
              }`}>
                <AlertCircle size={14} />
                <span>{dpMessage.text}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isModified && (
            <span className="text-amber-400 text-xs font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 animate-pulse">
              ● {t('item_detail.unsaved_changes')}
            </span>
          )}
          <button
            onClick={handleSaveClick}
            disabled={!isModified || isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg ${
              isModified
                ? 'bg-primary hover:bg-blue-600 text-white cursor-pointer shadow-primary/20'
                : 'bg-dark-800 text-gray-500 border border-dark-700 cursor-not-allowed'
            }`}
          >
            <Save size={16} />
            {isSaving ? t('common.saving') : t('item_detail.save_changes')}
          </button>
        </div>
      </div>

      {/* Forms Grid */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Basic Stats Card */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Package size={18} className="text-violet-400" />
            <h3 className="font-semibold">{t('item_detail.basic_stats')}</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select 
                value={localItem.Type || ''}
                onChange={e => handleFieldChange('Type', e.target.value)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-violet-500 focus:outline-none transition-colors"
              >
                <option value="">(None)</option>
                {['Healing', 'Usable', 'Etc', 'Armor', 'Weapon', 'Card', 'PetEgg', 'PetArmor', 'Ammo', 'DelayConsume', 'ShadowGear', 'Cash'].map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subtype</label>
              <select 
                value={localItem.SubType || ''}
                onChange={e => handleFieldChange('SubType', e.target.value)}
                disabled={!['Weapon', 'Ammo', 'Card'].includes(localItem.Type)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-violet-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">(None)</option>
                {localItem.Type === 'Weapon' && ['Fist', 'Dagger', '1hSword', '2hSword', '1hSpear', '2hSpear', '1hAxe', '2hAxe', 'Mace', '2hMace', 'Staff', 'Bow', 'Knuckle', 'Musical', 'Whip', 'Book', 'Katar', 'Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade', 'Huuma', '2hStaff'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                {localItem.Type === 'Ammo' && ['Arrow', 'Dagger', 'Bullet', 'Shell', 'Grenade', 'Shuriken', 'Kunai', 'Cannonball', 'ThrowWeapon'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                {localItem.Type === 'Card' && ['Normal', 'Enchant'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Buy</label>
              <input 
                type="number" 
                value={localItem.Buy ?? ''}
                onChange={e => handleFieldChange('Buy', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sell</label>
              <input 
                type="number" 
                value={localItem.Sell ?? ''}
                onChange={e => handleFieldChange('Sell', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Weight (x10)</label>
              <input 
                type="number" 
                value={localItem.Weight ?? ''}
                onChange={e => handleFieldChange('Weight', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">View ID</label>
              <input 
                type="number" 
                value={localItem.View ?? ''}
                onChange={e => handleFieldChange('View', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Combat Stats Card */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Sword size={18} className="text-red-400" />
            <h3 className="font-semibold">{t('item_detail.combat_equip')}</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Attack</label>
              <input 
                type="number" 
                value={localItem.Attack ?? ''}
                onChange={e => handleFieldChange('Attack', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-red-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Magic Attack (Matk)</label>
              <input 
                type="number" 
                value={localItem.MagicAttack ?? ''}
                onChange={e => handleFieldChange('MagicAttack', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Defense</label>
              <input 
                type="number" 
                value={localItem.Defense ?? ''}
                onChange={e => handleFieldChange('Defense', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-green-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slots</label>
              <input 
                type="number" 
                value={localItem.Slots ?? ''}
                onChange={e => handleFieldChange('Slots', e.target.value, true)}
                className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            {localItem.Type === 'Weapon' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Weapon Level</label>
                <input 
                  type="number" 
                  value={localItem.WeaponLevel ?? ''}
                  onChange={e => handleFieldChange('WeaponLevel', e.target.value, true)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
                />
              </div>
            )}
            {localItem.Type === 'Armor' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Armor Level</label>
                <select 
                  value={localItem.ArmorLevel ?? 1}
                  onChange={e => handleFieldChange('ArmorLevel', e.target.value, true)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-violet-500 focus:outline-none transition-colors"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-4 col-span-2 mt-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox"
                  checked={localItem.Refineable || false}
                  onChange={e => handleFieldChange('Refineable', e.target.checked)}
                  className="w-4 h-4 rounded bg-dark-900 border-white/10 text-violet-500 focus:ring-violet-500/50 cursor-pointer"
                />
                Refineable
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox"
                  checked={localItem.Gradable || false}
                  onChange={e => handleFieldChange('Gradable', e.target.checked)}
                  className="w-4 h-4 rounded bg-dark-900 border-white/10 text-violet-500 focus:ring-violet-500/50 cursor-pointer"
                />
                Gradeable
              </label>
            </div>
          </div>
        </div>

        {/* Restrições (Jobs, Classes, etc) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Users size={18} className="text-emerald-400" />
            <h3 className="font-semibold">{t('item_detail.restrictions')}</h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
               <label className="block text-xs text-gray-500 mb-1">Equip Level Min</label>
               <input 
                  type="number" 
                  value={localItem.EquipLevelMin ?? ''}
                  onChange={e => handleFieldChange('EquipLevelMin', e.target.value, true)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/50 focus:outline-none transition-colors"
               />
            </div>
            <div>
               <label className="block text-xs text-gray-500 mb-1">Equip Level Max</label>
               <input 
                  type="number" 
                  value={localItem.EquipLevelMax ?? ''}
                  onChange={e => handleFieldChange('EquipLevelMax', e.target.value, true)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/50 focus:outline-none transition-colors"
               />
            </div>
            <div>
               <label className="block text-xs text-gray-500 mb-1">Gender</label>
               <select 
                  value={localItem.Gender || 'Both'}
                  onChange={e => handleFieldChange('Gender', e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-emerald-500/50 focus:outline-none transition-colors"
               >
                  <option value="Both">Both</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
               </select>
            </div>
            <div>
               <label className="block text-xs text-gray-500 mb-1">Classes (Upper)</label>
               <select
                  value={(!localItem.Classes || localItem.Classes.All) ? 'All' : Object.entries(localItem.Classes).find(([_, v]) => v === true)?.[0] || 'All'}
                  onChange={e => {
                    const val = e.target.value;
                    handleFieldChange('Classes', val === 'All' ? { All: true } : { [val]: true });
                  }}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-emerald-500/50 focus:outline-none transition-colors"
               >
                 {['All', 'Normal', 'Upper', 'Baby', 'Third', 'Third_Upper', 'Third_Baby', 'Fourth', 'All_Upper', 'All_Baby', 'All_Third'].map(opt => (
                   <option key={opt} value={opt}>{opt}</option>
                 ))}
               </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
             <div>
                <label className="block text-xs text-gray-500 mb-1">Applicable Jobs</label>
                <Select
                  isMulti
                  options={JOB_OPTIONS}
                  value={getJobsValue()}
                  onChange={handleJobsChange}
                  styles={customSelectStyles}
                  placeholder="Select jobs..."
                  menuPortalTarget={document.body}
                />
             </div>
             <div>
                <label className="block text-xs text-gray-500 mb-1">Locations (Equip Placement)</label>
                <Select
                  isMulti
                  options={LOCATION_OPTIONS}
                  value={getLocationsValue()}
                  onChange={handleLocationsChange}
                  styles={customSelectStyles}
                  placeholder="Select locations..."
                  menuPortalTarget={document.body}
                />
             </div>
          </div>
        </div>

        {/* Scripts Card (Spans full width) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
          <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Box size={18} className="text-blue-400" />
            <h3 className="font-semibold">{t('item_detail.scripts')}</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2">{t('item_detail.main_script')}</label>
              <div className="h-48 border border-white/10 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
                <Editor
                  height="100%"
                  defaultLanguage="rathena-item-script"
                  theme="vs-dark"
                  value={getScriptString(localItem.Script)}
                  beforeMount={(monaco) => initRathenaItemScript(monaco)}
                  onMount={(editor, monaco) => validateItemScript(monaco, editor.getModel(), t)}
                  onChange={(val) => {
                    setLocalItem({...localItem, Script: val || '' });
                  }}
                  options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2">OnEquipScript</label>
                <div className="h-32 border border-white/10 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
                  <Editor
                    height="100%"
                    defaultLanguage="rathena-item-script"
                    theme="vs-dark"
                    value={getScriptString(localItem.EquipScript)}
                    beforeMount={(monaco) => initRathenaItemScript(monaco)}
                    onMount={(editor, monaco) => validateItemScript(monaco, editor.getModel(), t)}
                    onChange={(val) => {
                      setLocalItem({...localItem, EquipScript: val || '' });
                    }}
                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2">OnUnequipScript</label>
                <div className="h-32 border border-white/10 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors">
                  <Editor
                    height="100%"
                    defaultLanguage="rathena-item-script"
                    theme="vs-dark"
                    value={getScriptString(localItem.UnEquipScript)}
                    beforeMount={(monaco) => initRathenaItemScript(monaco)}
                    onMount={(editor, monaco) => validateItemScript(monaco, editor.getModel(), t)}
                    onChange={(val) => {
                      setLocalItem({...localItem, UnEquipScript: val || '' });
                    }}
                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dropped By Table (Spans full width) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
           <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Shield size={18} className="text-yellow-400" />
            <h3 className="font-semibold">{t('item_detail.dropped_by')}</h3>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/5">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-dark-900/50">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('item_detail.table.mob_id')}</th>
                  <th className="px-4 py-3 font-medium">{t('item_detail.table.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('item_detail.table.aegis_name')}</th>
                  <th className="px-4 py-3 font-medium">{t('item_detail.table.rate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoadingDrops ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      {t('item_detail.loading_drops')}
                    </td>
                  </tr>
                ) : drops.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      {t('item_detail.no_drops')}
                    </td>
                  </tr>
                ) : (
                  drops.map((drop, idx) => (
                    <tr key={idx} className="bg-dark-800/20 hover:bg-dark-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-violet-400">{drop.MobId}</td>
                      <td className="px-4 py-3 text-gray-300">{drop.MobName}</td>
                      <td className="px-4 py-3 font-mono text-gray-500">{drop.MobAegisName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          {(drop.Rate / 100).toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sold By (NPC Shops) */}
        <div className="bg-dark-800/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm shadow-xl xl:col-span-2">
           <div className="flex items-center gap-2 mb-4 text-white border-b border-white/5 pb-2">
            <Store size={18} className="text-cyan-400" />
            <h3 className="font-semibold">{t('item_detail.sold_by')}</h3>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
             {isLoadingShops ? (
                 <span className="text-sm text-gray-500 col-span-full">{t('item_detail.loading_shops')}</span>
             ) : soldBy.length === 0 ? (
                 <span className="text-sm text-gray-500 col-span-full">{t('item_detail.no_shops')}</span>
             ) : (
                 soldBy.map((shop, idx) => (
                     <button
                        key={idx}
                        onClick={() => setSelectedShop(shop)}
                        className="flex items-center gap-3 bg-dark-900 border border-white/10 p-3.5 rounded-xl hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:ring-2 hover:ring-cyan-500/10 transition-all shadow-sm w-full"
                     >
                         <div className="w-11 h-11 rounded-lg bg-dark-950 flex items-center justify-center shrink-0 overflow-hidden border border-white/5 shadow-inner">
                             <img 
                                src={`${API_URL}/api/grf/sprite?type=npc&id=${shop.sprite_id}`}
                                className="max-w-full max-h-full object-contain transform scale-125 hover:scale-150 transition-transform duration-200"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                             />
                         </div>
                         <div className="flex flex-col text-left min-w-0">
                            <span className="text-xs font-semibold text-gray-200 truncate">{shop.name}</span>
                            <span className="text-[10px] text-cyan-400/80 font-mono mt-0.5 truncate">
                              {shop.map} {shop.x > 0 || shop.y > 0 ? `(${shop.x}, ${shop.y})` : ''}
                            </span>
                         </div>
                      </button>
                  ))
             )}
          </div>
        </div>
        
      </div>
      
      {selectedShop && (
         <NpcShopModal 
            shop={selectedShop} 
            onClose={() => setSelectedShop(null)} 
         />
      )}

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-600 rounded-xl shadow-2xl p-6 max-w-md w-full flex flex-col gap-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Save className="text-primary-400" size={20} /> {t('item_detail.save_modal.title')}
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              {t('item_detail.save_modal.body', { id: `${item.Id}`, name: `${item.Name || item.AegisName}` })}
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <button
                onClick={() => executeSave('import')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t('item_detail.save_modal.create_copy')}</span>
              </button>
              <button
                onClick={() => executeSave('overwrite')}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t('item_detail.save_modal.overwrite')}</span>
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="w-full py-2 px-4 bg-dark-800 hover:bg-dark-700 text-gray-400 hover:text-white rounded-lg transition text-sm mt-1 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemDetail;
