import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Heart, Plus, Database, Sparkles, Save, Trash2, Sliders, Shield, FileText } from 'lucide-react';
import { RepeatableGroup } from '../components/RepeatableGroup';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';
import { ScriptEditor } from '../components/ScriptEditor';
import { useLanguageStore } from '../store/useLanguageStore';
import { toast } from '../store/useToastStore';

type SourceTab = 'rathena' | 'custom';

export const PetEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [pets, setPets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('pet_editor.status.loading'));
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedMob, setSelectedMob] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'fome' | 'combate' | 'scripts' | 'evolucoes'>('geral');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerConfig, setPickerConfig] = useState<{ open: boolean; type: 'item' | 'mob'; targetField: string; evoIdx?: number }>({ open: false, type: 'item', targetField: '' });

  useEffect(() => {
    fetchPets();
  }, []);

  const fetchPets = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/pets/?limit=10000`);
      setPets(res.data.pets || []);
      setIsLoading(false);
    } catch (err) {
      console.error("Erro ao carregar pets:", err);
      setLoadingStatus(t('pet_editor.status.error_fetching'));
      setIsLoading(false);
    }
  };

  const rathenaPets = useMemo(() => pets.filter(p => p._source === 'rathena'), [pets]);
  const customPets = useMemo(() => pets.filter(p => p._source === 'custom'), [pets]);

  const filteredPets = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaPets : customPets;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(p => String(p.Mob || '').toLowerCase().includes(q));
  }, [rathenaPets, customPets, sourceTab, searchText]);

  const selectedPet = useMemo(() => {
    return pets.find(p => p.Mob === selectedMob) || null;
  }, [pets, selectedMob]);

  const handleUpdateField = (field: string, value: any) => {
    if (!selectedPet) return;
    setPets(prev => prev.map(p => p.Mob === selectedPet.Mob ? { ...p, [field]: value } : p));
  };

  const handleAddEvolution = () => {
    if (!selectedPet) return;
    const evos = selectedPet.Evolutions || [];
    const updated = [...evos, { Target: 'PORING', ItemRequirements: [{ Item: 'Apple', Amount: 5 }] }];
    handleUpdateField('Evolutions', updated);
  };

  const handleRemoveEvolution = (idx: number) => {
    if (!selectedPet) return;
    const updated = (selectedPet.Evolutions || []).filter((_: any, i: number) => i !== idx);
    handleUpdateField('Evolutions', updated);
  };

  const handleSavePet = async () => {
    if (!selectedPet) return;
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/api/pets/${selectedPet.Mob}`, { data: selectedPet });
      toast.success(t('pet_editor.save_success'));
      setPets(prev => prev.map(p => p.Mob === selectedPet.Mob ? { ...selectedPet, _source: 'custom' } : p));
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao salvar pet:", err);
      toast.error(t('pet_editor.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewPet = async () => {
    try {
      const newPet = {
        Mob: "NOVO_PET_MOB",
        TameItem: "Apple",
        EggItem: "Poring_Egg",
        EquipItem: "Backpack",
        FoodItem: "Apple",
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
        Script: "",
        SupportScript: ""
      };
      const res = await axios.post(`${API_URL}/api/pets/`, { data: newPet });
      const created = res.data;
      created._source = 'custom';
      setPets(prev => [created, ...prev]);
      setSelectedMob(created.Mob);
      setSourceTab('custom');
    } catch (err) {
      console.error("Erro ao criar pet:", err);
      toast.error(t('pet_editor.create_error'));
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Heart size={18} className="text-pink-500" /> {t('pet_editor.sidebar.title')}
            </h2>
            <button
              onClick={handleCreateNewPet}
              className="p-1.5 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 rounded transition-colors"
              title={t('pet_editor.sidebar.add_pet')}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedMob(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-pink-600/80 text-white shadow-md shadow-pink-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} /> rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaPets.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedMob(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} /> Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {customPets.length.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="relative">
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
              itemContent={(index, pet) => {
                const isSelected = selectedMob === pet.Mob;
                const isCustom = pet._source === 'custom';
                return (
                  <div
                    onClick={() => setSelectedMob(pet.Mob)}
                    className={`p-3 cursor-pointer border-b border-white/5 transition-all duration-150 flex justify-between items-center ${
                      isSelected
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-pink-600/20 to-transparent border-l-2 border-l-pink-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <span className={`text-sm truncate font-medium ${isSelected ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {pet.Mob}
                      </span>
                      <span className="text-[11px] text-gray-500 font-mono">{t('pet_editor.sidebar.egg_item', { egg: pet.EggItem || 'N/A' })}</span>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-hidden relative">
        {selectedPet ? (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-[#12121a]/80 flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>{selectedPet.Mob}</span>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-mono ${selectedPet._source === 'custom' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-gray-400'}`}>
                    {selectedPet._source === 'custom' ? t('pet_editor.source.custom') : t('pet_editor.source.rathena')}
                  </span>
                </h1>
                <span className="text-xs font-mono text-gray-500">{t('pet_editor.detail.subtitle')}</span>
              </div>
              <button
                type="button"
                onClick={handleSavePet}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-pink-900/30 transition-all disabled:opacity-50"
              >
                <Save size={16} />
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
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'geral' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.mob')}</label>
                    <input
                      type="text"
                      value={selectedPet.Mob || ''}
                      onChange={(e) => handleUpdateField('Mob', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.tame_item')}</label>
                    <input
                      type="text"
                      value={selectedPet.TameItem || ''}
                      onChange={(e) => handleUpdateField('TameItem', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.egg_item')}</label>
                    <input
                      type="text"
                      value={selectedPet.EggItem || ''}
                      onChange={(e) => handleUpdateField('EggItem', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.equip_item')}</label>
                    <input
                      type="text"
                      value={selectedPet.EquipItem || ''}
                      onChange={(e) => handleUpdateField('EquipItem', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.food_item')}</label>
                    <input
                      type="text"
                      value={selectedPet.FoodItem || ''}
                      onChange={(e) => handleUpdateField('FoodItem', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'fome' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.fullness')}</label>
                    <input
                      type="number"
                      value={selectedPet.Fullness || 0}
                      onChange={(e) => handleUpdateField('Fullness', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.hungry_delay')}</label>
                    <input
                      type="number"
                      value={selectedPet.HungryDelay || 0}
                      onChange={(e) => handleUpdateField('HungryDelay', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.hunger_increase')}</label>
                    <input
                      type="number"
                      value={selectedPet.HungerIncrease || 0}
                      onChange={(e) => handleUpdateField('HungerIncrease', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.intimacy_start')}</label>
                    <input
                      type="number"
                      value={selectedPet.IntimacyStart || 0}
                      onChange={(e) => handleUpdateField('IntimacyStart', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.intimacy_fed')}</label>
                    <input
                      type="number"
                      value={selectedPet.IntimacyFed || 0}
                      onChange={(e) => handleUpdateField('IntimacyFed', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{t('pet_editor.fields.intimacy_hungry')}</label>
                    <input
                      type="number"
                      value={selectedPet.IntimacyHungry || 0}
                      onChange={(e) => handleUpdateField('IntimacyHungry', parseInt(e.target.value) || 0)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'combate' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PercentBadge
                    label={t('pet_editor.fields.capture_rate')}
                    value={selectedPet.CaptureRate || 1000}
                    onChange={(val) => handleUpdateField('CaptureRate', val)}
                    scale={100}
                  />
                  <PercentBadge
                    label={t('pet_editor.fields.attack_rate')}
                    value={selectedPet.AttackRate || 100}
                    onChange={(val) => handleUpdateField('AttackRate', val)}
                    scale={100}
                  />
                  <PercentBadge
                    label={t('pet_editor.fields.retaliate_rate')}
                    value={selectedPet.RetaliateRate || 100}
                    onChange={(val) => handleUpdateField('RetaliateRate', val)}
                    scale={100}
                  />
                  <PercentBadge
                    label={t('pet_editor.fields.change_target_rate')}
                    value={selectedPet.ChangeTargetRate || 100}
                    onChange={(val) => handleUpdateField('ChangeTargetRate', val)}
                    scale={100}
                  />
                </div>
              )}

              {activeTab === 'scripts' && (
                <div className="space-y-6">
                  <ScriptEditor
                    label={t('pet_editor.fields.script')}
                    value={selectedPet.Script || ''}
                    onChange={(val) => handleUpdateField('Script', val)}
                    height="160px"
                  />
                  <ScriptEditor
                    label={t('pet_editor.fields.support_script')}
                    value={selectedPet.SupportScript || ''}
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
            <h3 className="text-xl font-medium text-gray-400">{t('pet_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2">{t('pet_editor.no_selection.subtitle')}</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerConfig.open}
        onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
        type={pickerConfig.type}
        onSelect={(id, name) => {
          if (pickerConfig.targetField) {
            handleUpdateField(pickerConfig.targetField, name);
          }
        }}
      />
    </div>
  );
};

export default PetEditor;
