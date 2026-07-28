import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Heart, Plus, Sliders, Shield, FileText } from 'lucide-react';
import { RepeatableGroup } from '../components/RepeatableGroup';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';
import { ScriptEditor } from '../components/ScriptEditor';
import { SourceToggleBar } from '../components/SourceToggleBar';
import PetAnimator from '../components/PetAnimator';
import { useLanguageStore } from '../store/useLanguageStore';
import { toast } from '../store/useToastStore';

/** Shape of a single pet entry from the API. */
interface PetEntry {
  Mob: string;
  EggItem?: string;
  EquipItem?: string;
  TameItem?: string;
  FoodItem?: string;
  Fullness?: number;
  HungryDelay?: number;
  HungerIncrease?: number;
  IntimacyStart?: number;
  IntimacyFed?: number;
  IntimacyOverfed?: number;
  IntimacyHungry?: number;
  IntimacyOwnerDie?: number;
  CaptureRate?: number;
  AttackRate?: number;
  RetaliateRate?: number;
  ChangeTargetRate?: number;
  Script?: string;
  SupportScript?: string;
  Evolutions?: { Target: string; ItemRequirements: { Item: string; Amount: number }[] }[];
  _source?: 'rathena' | 'custom';
  [key: string]: unknown;
}

type SourceTab = 'rathena' | 'custom';

/** Fallback 1×1 transparent PNG to display when an egg icon is unavailable. */
const FALLBACK_EGG = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><ellipse cx='12' cy='13' rx='7' ry='8'/></svg>`;

export const PetEditor: React.FC = () => {
  const t = useLanguageStore((state) => state.t);
  const [pets, setPets] = useState<PetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('pet_editor.status.loading'));
  const [searchText, setSearchText] = useState('');
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedMob, setSelectedMob] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'fome' | 'combate' | 'scripts'>('geral');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerConfig, setPickerConfig] = useState<{
    open: boolean;
    type: 'item' | 'mob';
    targetField: string;
  }>({ open: false, type: 'item', targetField: '' });

  useEffect(() => {
    fetchPets();
  }, []);

  const fetchPets = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/pets/?limit=10000`);
      setPets(res.data.pets || []);
      setIsLoading(false);
    } catch {
      setLoadingStatus(t('pet_editor.status.error_fetching'));
      setIsLoading(false);
    }
  };

  const rathenaPets = useMemo(() => pets.filter((p) => p._source !== 'custom'), [pets]);
  const customPets = useMemo(() => pets.filter((p) => p._source === 'custom'), [pets]);

  const filteredPets = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaPets : customPets;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter((p) => String(p.Mob || '').toLowerCase().includes(q));
  }, [rathenaPets, customPets, sourceTab, searchText]);

  const selectedPet = useMemo(
    () => pets.find((p) => p.Mob === selectedMob) ?? null,
    [pets, selectedMob],
  );

  const handleUpdateField = (field: string, value: unknown) => {
    if (!selectedPet) return;
    setPets((prev) =>
      prev.map((p) => (p.Mob === selectedPet.Mob ? { ...p, [field]: value } : p)),
    );
  };

  const handleSavePet = async () => {
    if (!selectedPet) return;
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/api/pets/${selectedPet.Mob}`, { data: selectedPet });
      toast.success(t('pet_editor.save_success'));
      setPets((prev) =>
        prev.map((p) => (p.Mob === selectedPet.Mob ? { ...selectedPet, _source: 'custom' } : p)),
      );
      setSourceTab('custom');
    } catch {
      toast.error(t('pet_editor.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewPet = async () => {
    try {
      const newPet: Partial<PetEntry> = {
        Mob: 'NOVO_PET_MOB',
        TameItem: 'Apple',
        EggItem: 'Poring_Egg',
        EquipItem: 'Backpack',
        FoodItem: 'Apple',
        Fullness: 80,
        HungryDelay: 60,
        HungerIncrease: 20,
        IntimacyStart: 250,
        IntimacyFed: 50,
        IntimacyOverfed: -100,
        IntimacyHungry: -50,
        IntimacyOwnerDie: -20,
        CaptureRate: 1500,
        AttackRate: 100,
        RetaliateRate: 100,
        ChangeTargetRate: 100,
        Script: '',
        SupportScript: '',
      };
      const res = await axios.post(`${API_URL}/api/pets/`, { data: newPet });
      const created: PetEntry = { ...res.data, _source: 'custom' };
      setPets((prev) => [created, ...prev]);
      setSelectedMob(created.Mob);
      setSourceTab('custom');
    } catch {
      toast.error(t('pet_editor.create_error'));
    }
  };

  /** Returns the URL for the egg icon, falling back to resource_name lookup. */
  const eggIconUrl = (eggItem: string | undefined) => {
    if (!eggItem) return FALLBACK_EGG;
    return `${API_URL}/api/images/item_icon?resource_name=${encodeURIComponent(eggItem)}`;
  };

  /** Returns the URL for the equip item icon (accessory overlay). */
  const equipIconUrl = (equipItem: string | undefined) => {
    if (!equipItem) return null;
    return `${API_URL}/api/images/item_icon?resource_name=${encodeURIComponent(equipItem)}`;
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* ── Sidebar ── */}
      <div className="w-[300px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Heart size={18} className="text-pink-500" />
              {t('pet_editor.sidebar.title')}
            </h2>
            <button
              onClick={handleCreateNewPet}
              className="p-1.5 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 rounded transition-colors"
              title={t('pet_editor.sidebar.add_pet')}
            >
              <Plus size={16} />
            </button>
          </div>

          <SourceToggleBar
            value={sourceTab}
            onChange={(v) => { setSourceTab(v); setSelectedMob(null); }}
            countRathena={rathenaPets.length}
            countCustom={customPets.length}
            accentColor="pink"
          />

          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={t('pet_editor.sidebar.search_placeholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-pink-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">{loadingStatus}</div>
          ) : (
            <Virtuoso
              data={filteredPets}
              style={{ height: '100%' }}
              itemContent={(_index, pet) => {
                const isSelected = selectedMob === pet.Mob;
                const isCustom = pet._source === 'custom';
                return (
                  <div
                    data-testid={`pet-list-item-${pet.Mob}`}
                    onClick={() => setSelectedMob(pet.Mob)}
                    className={`p-3 cursor-pointer border-b border-white/5 transition-all duration-150 flex items-center gap-3 ${
                      isSelected
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-pink-600/20 to-transparent border-l-2 border-l-pink-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Egg icon */}
                    <div className="w-9 h-9 flex-shrink-0 rounded-md overflow-hidden bg-dark-900/60 border border-white/5 flex items-center justify-center">
                      <img
                        data-testid={`pet-egg-icon-${pet.Mob}`}
                        src={eggIconUrl(pet.EggItem)}
                        alt={pet.EggItem ?? ''}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = FALLBACK_EGG;
                        }}
                        className="w-full h-full object-contain pixelated"
                      />
                    </div>

                    {/* Text */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className={`text-sm truncate font-medium ${
                          isSelected ? 'text-white font-semibold' : 'text-gray-300'
                        }`}
                      >
                        {pet.Mob}
                      </span>
                      <span className="text-[11px] text-gray-500 font-mono truncate">
                        {t('pet_editor.sidebar.egg_item', { egg: pet.EggItem ?? 'N/A' })}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* ── Main Detail View ── */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-hidden relative">
        {selectedPet ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-[#12121a]/80 flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>{selectedPet.Mob}</span>
                  <span
                    className={`text-[10px] uppercase px-2 py-0.5 rounded font-mono ${
                      selectedPet._source === 'custom'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-dark-800 text-gray-400'
                    }`}
                  >
                    {selectedPet._source === 'custom'
                      ? t('pet_editor.source.custom')
                      : t('pet_editor.source.rathena')}
                  </span>
                </h1>
                <span className="text-xs font-mono text-gray-500">
                  {t('pet_editor.detail.subtitle')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSavePet}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-pink-900/30 transition-all disabled:opacity-50"
              >
                <Heart size={16} />
                <span>{t('pet_editor.detail.save_button')}</span>
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-dark-800 bg-dark-900/40 px-4 gap-4">
              {[
                { id: 'geral', label: t('pet_editor.tabs.general'), icon: Sliders },
                { id: 'fome', label: t('pet_editor.tabs.hunger'), icon: Heart },
                { id: 'combate', label: t('pet_editor.tabs.combat'), icon: Shield },
                { id: 'scripts', label: t('pet_editor.tabs.scripts'), icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-pink-500 text-pink-400'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* ── Geral: 2-column layout ── */}
              {activeTab === 'geral' && (
                <div className="flex gap-6 h-full">
                  {/* Left column — inputs */}
                  <div className="flex-1 min-w-0 grid grid-cols-1 gap-4 content-start">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">
                        {t('pet_editor.fields.mob')}
                      </label>
                      <input
                        type="text"
                        value={selectedPet.Mob ?? ''}
                        onChange={(e) => handleUpdateField('Mob', e.target.value)}
                        className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-pink-500/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">
                        {t('pet_editor.fields.tame_item')}
                      </label>
                      <input
                        type="text"
                        value={selectedPet.TameItem ?? ''}
                        onChange={(e) => handleUpdateField('TameItem', e.target.value)}
                        className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-pink-500/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">
                        {t('pet_editor.fields.egg_item')}
                      </label>
                      <input
                        type="text"
                        value={selectedPet.EggItem ?? ''}
                        onChange={(e) => handleUpdateField('EggItem', e.target.value)}
                        className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-pink-500/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">
                        {t('pet_editor.fields.equip_item')}
                      </label>
                      <input
                        type="text"
                        value={selectedPet.EquipItem ?? ''}
                        onChange={(e) => handleUpdateField('EquipItem', e.target.value)}
                        className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-pink-500/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">
                        {t('pet_editor.fields.food_item')}
                      </label>
                      <input
                        type="text"
                        value={selectedPet.FoodItem ?? ''}
                        onChange={(e) => handleUpdateField('FoodItem', e.target.value)}
                        className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-pink-500/50"
                      />
                    </div>
                  </div>

                  {/* Right column — sprite preview */}
                  <div className="w-[220px] flex-shrink-0 flex flex-col gap-4">
                    {/* Card: Pet Normal */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        {t('pet_editor.viewer.pet_label')}
                      </span>
                      <PetAnimator
                        mobAegisName={selectedPet.Mob}
                        label="pet"
                        size="md"
                      />
                    </div>

                    {/* Card: Pet + Accessory */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        {t('pet_editor.viewer.pet_equip_label')}
                      </span>
                      <PetAnimator
                        mobAegisName={selectedPet.Mob}
                        label="pet-accessory"
                        size="md"
                        overlay={
                          selectedPet.EquipItem ? (
                            <div
                              data-testid="pet-accessory-overlay"
                              className="w-8 h-8 rounded border border-white/10 bg-dark-900/70 overflow-hidden"
                              title={t('pet_editor.viewer.equip_preview')}
                            >
                              <img
                                src={equipIconUrl(selectedPet.EquipItem) ?? ''}
                                alt={selectedPet.EquipItem}
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                                className="w-full h-full object-contain pixelated"
                              />
                            </div>
                          ) : undefined
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Fome ── */}
              {activeTab === 'fome' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">
                      {t('pet_editor.fields.fullness')}
                    </label>
                    <input
                      type="number"
                      value={selectedPet.Fullness ?? 0}
                      onChange={(e) => handleUpdateField('Fullness', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">
                      {t('pet_editor.fields.hungry_delay')}
                    </label>
                    <input
                      type="number"
                      value={selectedPet.HungryDelay ?? 0}
                      onChange={(e) =>
                        handleUpdateField('HungryDelay', parseInt(e.target.value) || 0)
                      }
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">
                      {t('pet_editor.fields.hunger_increase')}
                    </label>
                    <input
                      type="number"
                      value={selectedPet.HungerIncrease ?? 0}
                      onChange={(e) =>
                        handleUpdateField('HungerIncrease', parseInt(e.target.value) || 0)
                      }
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">
                      {t('pet_editor.fields.intimacy_start')}
                    </label>
                    <input
                      type="number"
                      value={selectedPet.IntimacyStart ?? 0}
                      onChange={(e) =>
                        handleUpdateField('IntimacyStart', parseInt(e.target.value) || 0)
                      }
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">
                      {t('pet_editor.fields.intimacy_fed')}
                    </label>
                    <input
                      type="number"
                      value={selectedPet.IntimacyFed ?? 0}
                      onChange={(e) =>
                        handleUpdateField('IntimacyFed', parseInt(e.target.value) || 0)
                      }
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">
                      {t('pet_editor.fields.intimacy_hungry')}
                    </label>
                    <input
                      type="number"
                      value={selectedPet.IntimacyHungry ?? 0}
                      onChange={(e) =>
                        handleUpdateField('IntimacyHungry', parseInt(e.target.value) || 0)
                      }
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              )}

              {/* ── Combate ── */}
              {activeTab === 'combate' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PercentBadge
                    label={t('pet_editor.fields.capture_rate')}
                    value={selectedPet.CaptureRate ?? 1000}
                    onChange={(val) => handleUpdateField('CaptureRate', val)}
                    scale={100}
                  />
                  <PercentBadge
                    label={t('pet_editor.fields.attack_rate')}
                    value={selectedPet.AttackRate ?? 100}
                    onChange={(val) => handleUpdateField('AttackRate', val)}
                    scale={100}
                  />
                  <PercentBadge
                    label={t('pet_editor.fields.retaliate_rate')}
                    value={selectedPet.RetaliateRate ?? 100}
                    onChange={(val) => handleUpdateField('RetaliateRate', val)}
                    scale={100}
                  />
                  <PercentBadge
                    label={t('pet_editor.fields.change_target_rate')}
                    value={selectedPet.ChangeTargetRate ?? 100}
                    onChange={(val) => handleUpdateField('ChangeTargetRate', val)}
                    scale={100}
                  />
                </div>
              )}

              {/* ── Scripts ── */}
              {activeTab === 'scripts' && (
                <div className="space-y-6">
                  <ScriptEditor
                    label={t('pet_editor.fields.script')}
                    value={selectedPet.Script ?? ''}
                    onChange={(val) => handleUpdateField('Script', val)}
                    height="160px"
                  />
                  <ScriptEditor
                    label={t('pet_editor.fields.support_script')}
                    value={selectedPet.SupportScript ?? ''}
                    onChange={(val) => handleUpdateField('SupportScript', val)}
                    height="160px"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Heart size={64} className="mb-4 opacity-20 text-pink-500" />
            <h3 className="text-xl font-medium text-gray-400">
              {t('pet_editor.no_selection.title')}
            </h3>
            <p className="text-sm mt-2">{t('pet_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerConfig.open}
        onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
        type={pickerConfig.type}
        onSelect={(_id, name) => {
          if (pickerConfig.targetField) handleUpdateField(pickerConfig.targetField, name);
        }}
      />
    </div>
  );
};

export default PetEditor;
