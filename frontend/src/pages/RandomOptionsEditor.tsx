import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { ReferencePicker } from '../components/ReferencePicker';
import { Virtuoso } from 'react-virtuoso';
import {
  Search,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Loader2,
  Layers,
  Link2,
  ShieldAlert,
  Check,
  Package,
  Wand2,
  AlertCircle
} from 'lucide-react';

interface OptionDefinition {
  Id: number;
  Option: string;
}

interface OptionItem {
  Option: string;
  MinValue?: number;
  MaxValue?: number;
  Param?: number;
  Chance: number;
}

interface SlotItem {
  Slot: number;
  Options: OptionItem[];
}

interface TargetItemEntry {
  Item: string;
}

interface LaphineData {
  Item: string;
  RequiredRandomOptions?: number;
  ResultRefine?: number | null;
  TargetItems: TargetItemEntry[];
}

interface UnifiedGroup {
  Id: number;
  Group: string;
  MaxRandom?: number;
  Slots?: SlotItem[];
  Random?: OptionItem[];
  Options?: OptionItem[];
  LaphineData?: LaphineData;
}

export const RandomOptionsEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);

  const [options, setOptions] = useState<OptionDefinition[]>([]);
  const [groups, setGroups] = useState<UnifiedGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'laphine'>('rules');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals for ReferencePicker
  const [applicatorPickerOpen, setApplicatorPickerOpen] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/random-options-groups`);
      setOptions(res.data.options || []);
      const loadedGroups: UnifiedGroup[] = res.data.groups || [];
      const normalized = loadedGroups.map(g => ({
        ...g,
        MaxRandom: g.MaxRandom ?? 0,
        Slots: g.Slots || [],
        Random: g.Random || [],
        LaphineData: g.LaphineData || {
          Item: '',
          RequiredRandomOptions: 0,
          ResultRefine: null,
          TargetItems: []
        }
      }));
      setGroups(normalized);
      if (normalized.length > 0 && selectedGroupId === null) {
        setSelectedGroupId(normalized[0].Id);
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching random options:', err);
      setIsLoading(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!searchText.trim()) return groups;
    const q = searchText.toLowerCase();
    return groups.filter(
      g =>
        String(g.Id).includes(q) ||
        (g.Group && g.Group.toLowerCase().includes(q))
    );
  }, [groups, searchText]);

  const selectedGroup = useMemo(() => {
    return groups.find(g => g.Id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  const updateSelectedGroup = (updater: (prev: UnifiedGroup) => UnifiedGroup) => {
    if (!selectedGroupId) return;
    setGroups(prevList =>
      prevList.map(g => (g.Id === selectedGroupId ? updater(g) : g))
    );
  };

  const handleAddNewGroup = () => {
    const nextId =
      groups.length > 0 ? Math.max(...groups.map(g => g.Id)) + 1 : 1;
    const newG: UnifiedGroup = {
      Id: nextId,
      Group: `NEW_GROUP_${nextId}`,
      MaxRandom: 0,
      Slots: [
        {
          Slot: 1,
          Options: []
        }
      ],
      Random: [],
      Options: [],
      LaphineData: {
        Item: '',
        RequiredRandomOptions: 0,
        ResultRefine: null,
        TargetItems: []
      }
    };
    setGroups(prev => [newG, ...prev]);
    setSelectedGroupId(nextId);
    setActiveTab('rules');
  };

  const handleDeleteGroup = (id: number) => {
    setGroups(prev => prev.filter(g => g.Id !== id));
    if (selectedGroupId === id) {
      const remaining = groups.filter(g => g.Id !== id);
      setSelectedGroupId(remaining.length > 0 ? remaining[0].Id : null);
    }
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      await axios.put(`${API_URL}/api/random-options-groups`, {
        groups
      });
      setSaveMessage({
        text: (t('random_options_manager.save_success' as any) as string) || 'Saved successfully!',
        type: 'success'
      });
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err) {
      console.error('Error saving groups:', err);
      setSaveMessage({
        text: (t('random_options_manager.save_error' as any) as string) || 'Error saving.',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Slots actions
  const addSlot = () => {
    updateSelectedGroup(g => {
      const slots = [...(g.Slots || [])];
      slots.push({
        Slot: slots.length + 1,
        Options: []
      });
      return { ...g, Slots: slots };
    });
  };

  const removeSlot = (slotIdx: number) => {
    updateSelectedGroup(g => {
      const slots = (g.Slots || [])
        .filter((_, idx) => idx !== slotIdx)
        .map((s, i) => ({ ...s, Slot: i + 1 }));
      return { ...g, Slots: slots };
    });
  };

  const addOptionToSlot = (slotIdx: number) => {
    updateSelectedGroup(g => {
      const slots = [...(g.Slots || [])];
      const targetSlot = slots[slotIdx];
      if (targetSlot) {
        targetSlot.Options = [
          ...targetSlot.Options,
          {
            Option: options[0]?.Option || 'VAR_MAXHPAMOUNT',
            MinValue: 1,
            MaxValue: 5,
            Param: 0,
            Chance: 1000
          }
        ];
      }
      return { ...g, Slots: slots };
    });
  };

  const updateOptionInSlot = (
    slotIdx: number,
    optIdx: number,
    field: keyof OptionItem,
    val: any
  ) => {
    updateSelectedGroup(g => {
      const slots = [...(g.Slots || [])];
      const slot = slots[slotIdx];
      if (slot && slot.Options[optIdx]) {
        slot.Options[optIdx] = {
          ...slot.Options[optIdx],
          [field]: val
        };
      }
      return { ...g, Slots: slots };
    });
  };

  const removeOptionFromSlot = (slotIdx: number, optIdx: number) => {
    updateSelectedGroup(g => {
      const slots = [...(g.Slots || [])];
      const slot = slots[slotIdx];
      if (slot) {
        slot.Options = slot.Options.filter((_, i) => i !== optIdx);
      }
      return { ...g, Slots: slots };
    });
  };

  // Random Pool actions
  const addRandomPoolOption = () => {
    updateSelectedGroup(g => {
      const rnd = [...(g.Random || [])];
      rnd.push({
        Option: options[0]?.Option || 'VAR_MAXHPAMOUNT',
        MinValue: 1,
        MaxValue: 5,
        Param: 0,
        Chance: 1000
      });
      return { ...g, Random: rnd };
    });
  };

  const updateRandomPoolOption = (optIdx: number, field: keyof OptionItem, val: any) => {
    updateSelectedGroup(g => {
      const rnd = [...(g.Random || [])];
      if (rnd[optIdx]) {
        rnd[optIdx] = {
          ...rnd[optIdx],
          [field]: val
        };
      }
      return { ...g, Random: rnd };
    });
  };

  const removeRandomPoolOption = (optIdx: number) => {
    updateSelectedGroup(g => {
      const rnd = (g.Random || []).filter((_, i) => i !== optIdx);
      return { ...g, Random: rnd };
    });
  };

  // Laphine actions
  const setLaphineField = (field: keyof LaphineData, val: any) => {
    updateSelectedGroup(g => {
      const laphine = {
        ...(g.LaphineData || {
          Item: '',
          RequiredRandomOptions: 0,
          ResultRefine: null,
          TargetItems: []
        }),
        [field]: val
      };
      return { ...g, LaphineData: laphine };
    });
  };

  const handleSelectApplicator = (id: number | string, name: string) => {
    setLaphineField('Item', String(name));
    setApplicatorPickerOpen(false);
  };

  const handleSelectTargetItem = (id: number | string, name: string) => {
    updateSelectedGroup(g => {
      const laphine = {
        ...(g.LaphineData || {
          Item: '',
          RequiredRandomOptions: 0,
          ResultRefine: null,
          TargetItems: []
        })
      };
      const targets = [...(laphine.TargetItems || [])];
      if (!targets.some(t => t.Item === String(name))) {
        targets.push({ Item: String(name) });
      }
      laphine.TargetItems = targets;
      return { ...g, LaphineData: laphine };
    });
    setTargetPickerOpen(false);
  };

  const removeTargetItem = (index: number) => {
    updateSelectedGroup(g => {
      const laphine = { ...(g.LaphineData || { Item: '', TargetItems: [] }) };
      laphine.TargetItems = (laphine.TargetItems || []).filter((_, i) => i !== index);
      return { ...g, LaphineData: laphine };
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-gray-400">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <span>{(t('common.loading' as any) as string) || 'Loading...'}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4 p-4 text-gray-100">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-gradient-to-r from-gray-900 via-indigo-950/40 to-gray-900 p-4 rounded-xl border border-indigo-500/20 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              {(t('random_options_manager.title' as any) as string) || 'Unified Random Options Manager'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {(t('random_options_manager.subtitle' as any) as string) ||
                'Edit group rules (item_randomopt_group.yml) and item application (laphine_upgrade.yml) in a single relational interface.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 md:mt-0">
          {saveMessage && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                saveMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {saveMessage.type === 'success' ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>{saveMessage.text}</span>
            </div>
          )}

          <button
            onClick={handleAddNewGroup}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>{(t('random_options_manager.new_group' as any) as string) || 'New Group'}</span>
          </button>

          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{(t('common.save' as any) as string) || 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left Sidebar - Group List */}
        <div className="w-80 flex flex-col bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden shadow-md">
          {/* Search */}
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder={
                  (t('random_options_manager.search_placeholder' as any) as string) ||
                  'Search group by ID or name...'
                }
                className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/50">
            {filteredGroups.map(g => {
              const isSelected = g.Id === selectedGroupId;
              const hasLaphine =
                g.LaphineData?.Item ||
                (g.LaphineData?.TargetItems && g.LaphineData.TargetItems.length > 0);
              return (
                <div
                  key={g.Id}
                  onClick={() => setSelectedGroupId(g.Id)}
                  className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 border-l-4 border-indigo-500 text-white'
                      : 'hover:bg-gray-800/60 text-gray-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-xs font-mono">
                        #{g.Id}
                      </span>
                      <span className="font-semibold text-sm truncate">
                        {g.Group}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {hasLaphine ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20">
                          <Link2 className="w-3 h-3" />
                          <span>Laphine Linked</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">
                          Rules Only
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteGroup(g.Id);
                    }}
                    className="p-1.5 text-gray-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {filteredGroups.length === 0 && (
              <div className="p-6 text-center text-xs text-gray-500">
                No groups found.
              </div>
            )}
          </div>
        </div>

        {/* Right Editor Area */}
        <div className="flex-1 flex flex-col bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden shadow-md">
          {selectedGroup ? (
            <>
              {/* Group Header Info */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/40">
                <div className="flex items-center gap-4 flex-1">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500">
                      {(t('random_options_manager.group_id' as any) as string) || 'Group ID'}
                    </label>
                    <input
                      type="number"
                      value={selectedGroup.Id}
                      onChange={e =>
                        updateSelectedGroup(g => ({
                          ...g,
                          Id: parseInt(e.target.value) || g.Id
                        }))
                      }
                      className="block w-24 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm font-mono text-indigo-300"
                    />
                  </div>

                  <div className="flex-1 max-w-md">
                    <label className="text-[10px] uppercase font-bold text-gray-500">
                      {(t('random_options_manager.group_name' as any) as string) ||
                        'Group Name (Foreign Key)'}
                    </label>
                    <input
                      type="text"
                      value={selectedGroup.Group}
                      onChange={e =>
                        updateSelectedGroup(g => ({
                          ...g,
                          Group: e.target.value
                        }))
                      }
                      className="block w-full bg-gray-950 border border-gray-700 rounded px-3 py-1 text-sm font-semibold text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500">
                      {(t('random_options_manager.max_random' as any) as string) ||
                        'Max Random Options'}
                    </label>
                    <input
                      type="number"
                      value={selectedGroup.MaxRandom || 0}
                      onChange={e =>
                        updateSelectedGroup(g => ({
                          ...g,
                          MaxRandom: parseInt(e.target.value) || 0
                        }))
                      }
                      className="block w-24 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-center text-purple-300"
                    />
                  </div>
                </div>

                {/* Tabs Switch */}
                <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800">
                  <button
                    onClick={() => setActiveTab('rules')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      activeTab === 'rules'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {(t('random_options_manager.tab_rules' as any) as string) ||
                        'Group Rules'}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('laphine')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      activeTab === 'laphine'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>
                      {(t('random_options_manager.tab_laphine' as any) as string) ||
                        'Application & Targets (Laphine)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'rules' ? (
                  <div className="space-y-6">
                    {/* Guaranteed Slots */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Layers className="w-5 h-5 text-indigo-400" />
                          <h3 className="text-sm font-bold text-gray-200">
                            {(t('random_options_manager.slots_section' as any) as string) ||
                              'Guaranteed Slots'}
                          </h3>
                        </div>
                        <button
                          onClick={addSlot}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            {(t('random_options_manager.add_slot' as any) as string) ||
                              'Add Slot'}
                          </span>
                        </button>
                      </div>

                      <div className="space-y-4">
                        {(selectedGroup.Slots || []).map((slot, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-gray-900 border border-gray-800 rounded-lg p-3"
                          >
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800">
                              <span className="text-xs font-bold text-indigo-400">
                                Slot #{slot.Slot}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => addOptionToSlot(sIdx)}
                                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded text-gray-300 flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>
                                    {(t('random_options_manager.add_option' as any) as string) ||
                                      'Add Option'}
                                  </span>
                                </button>
                                <button
                                  onClick={() => removeSlot(sIdx)}
                                  className="p-1 text-gray-500 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {slot.Options.map((opt, oIdx) => (
                                <div
                                  key={oIdx}
                                  className="grid grid-cols-12 gap-2 items-center bg-gray-950 p-2 rounded border border-gray-800/80"
                                >
                                  <div className="col-span-5">
                                    <select
                                      value={opt.Option}
                                      onChange={e =>
                                        updateOptionInSlot(
                                          sIdx,
                                          oIdx,
                                          'Option',
                                          e.target.value
                                        )
                                      }
                                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                                    >
                                      {options.map(o => (
                                        <option key={o.Id} value={o.Option}>
                                          {o.Option}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      placeholder="Min"
                                      value={opt.MinValue ?? 1}
                                      onChange={e =>
                                        updateOptionInSlot(
                                          sIdx,
                                          oIdx,
                                          'MinValue',
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-center"
                                    />
                                  </div>

                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      placeholder="Max"
                                      value={opt.MaxValue ?? 5}
                                      onChange={e =>
                                        updateOptionInSlot(
                                          sIdx,
                                          oIdx,
                                          'MaxValue',
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-center"
                                    />
                                  </div>

                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      placeholder="Chance"
                                      value={opt.Chance ?? 1000}
                                      onChange={e =>
                                        updateOptionInSlot(
                                          sIdx,
                                          oIdx,
                                          'Chance',
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-center text-emerald-400"
                                    />
                                  </div>

                                  <div className="col-span-1 flex justify-center">
                                    <button
                                      onClick={() =>
                                        removeOptionFromSlot(sIdx, oIdx)
                                      }
                                      className="text-gray-500 hover:text-rose-400"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {slot.Options.length === 0 && (
                                <div className="text-center py-2 text-xs text-gray-600">
                                  No options defined in this slot.
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {(selectedGroup.Slots || []).length === 0 && (
                          <div className="text-center py-4 text-xs text-gray-500">
                            No guaranteed slots configured.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Random Pool */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Wand2 className="w-5 h-5 text-purple-400" />
                          <h3 className="text-sm font-bold text-gray-200">
                            {(t('random_options_manager.random_section' as any) as string) ||
                              'Random Pool (Random)'}
                          </h3>
                        </div>
                        <button
                          onClick={addRandomPoolOption}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            {(t('random_options_manager.add_option' as any) as string) ||
                              'Add Option'}
                          </span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(selectedGroup.Random || []).map((opt, rIdx) => (
                          <div
                            key={rIdx}
                            className="grid grid-cols-12 gap-2 items-center bg-gray-900 p-2 rounded border border-gray-800"
                          >
                            <div className="col-span-5">
                              <select
                                value={opt.Option}
                                onChange={e =>
                                  updateRandomPoolOption(
                                    rIdx,
                                    'Option',
                                    e.target.value
                                  )
                                }
                                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                              >
                                {options.map(o => (
                                  <option key={o.Id} value={o.Option}>
                                    {o.Option}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-2">
                              <input
                                type="number"
                                placeholder="Min"
                                value={opt.MinValue ?? 1}
                                onChange={e =>
                                  updateRandomPoolOption(
                                    rIdx,
                                    'MinValue',
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-center"
                              />
                            </div>

                            <div className="col-span-2">
                              <input
                                type="number"
                                placeholder="Max"
                                value={opt.MaxValue ?? 5}
                                onChange={e =>
                                  updateRandomPoolOption(
                                    rIdx,
                                    'MaxValue',
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-center"
                              />
                            </div>

                            <div className="col-span-2">
                              <input
                                type="number"
                                placeholder="Chance"
                                value={opt.Chance ?? 1000}
                                onChange={e =>
                                  updateRandomPoolOption(
                                    rIdx,
                                    'Chance',
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-center text-emerald-400"
                              />
                            </div>

                            <div className="col-span-1 flex justify-center">
                              <button
                                onClick={() => removeRandomPoolOption(rIdx)}
                                className="text-gray-500 hover:text-rose-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(selectedGroup.Random || []).length === 0 && (
                          <div className="text-center py-4 text-xs text-gray-500">
                            No random pool options configured.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Applicator Consumable Item */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                            <Package className="w-4 h-4 text-indigo-400" />
                            <span>
                              {(t('random_options_manager.applicator_section' as any) as string) ||
                                'Applicator Consumable Item'}
                            </span>
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {(t('random_options_manager.applicator_desc' as any) as string) ||
                              'Which consumable item triggers this option group when used.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-indigo-300">
                          {selectedGroup.LaphineData?.Item || 'None configured'}
                        </div>
                        <button
                          onClick={() => setApplicatorPickerOpen(true)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          {(t('random_options_manager.select_applicator' as any) as string) ||
                            'Select Applicator Item...'}
                        </button>
                        {selectedGroup.LaphineData?.Item && (
                          <button
                            onClick={() => setLaphineField('Item', '')}
                            className="p-2 text-gray-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="text-xs font-semibold text-gray-400 block mb-1">
                            {(t('random_options_manager.req_opts' as any) as string) ||
                              'Required Random Options'}
                          </label>
                          <input
                            type="number"
                            value={
                              selectedGroup.LaphineData?.RequiredRandomOptions || 0
                            }
                            onChange={e =>
                              setLaphineField(
                                'RequiredRandomOptions',
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-400 block mb-1">
                            {(t('random_options_manager.result_refine' as any) as string) ||
                              'Result Refine'}
                          </label>
                          <input
                            type="number"
                            placeholder="Optional refine..."
                            value={selectedGroup.LaphineData?.ResultRefine ?? ''}
                            onChange={e =>
                              setLaphineField(
                                'ResultRefine',
                                e.target.value ? parseInt(e.target.value) : null
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Target Items List with react-virtuoso */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 flex flex-col h-96">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-purple-400" />
                            <span>
                              {(t(
                                'random_options_manager.target_items_section' as any
                              ) as string) || 'Target Items (Compatible Equipment)'}
                            </span>
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {(t('random_options_manager.target_items_desc' as any) as string) ||
                              'Equipment that can receive this option group via Laphine Upgrade.'}
                          </p>
                        </div>

                        <button
                          onClick={() => setTargetPickerOpen(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            {(t('random_options_manager.add_target' as any) as string) ||
                              'Add Target Item'}
                          </span>
                        </button>
                      </div>

                      <div className="flex-1 border border-gray-800 rounded-lg overflow-hidden bg-gray-900/40">
                        {selectedGroup.LaphineData?.TargetItems &&
                        selectedGroup.LaphineData.TargetItems.length > 0 ? (
                          <Virtuoso
                            style={{ height: '100%', width: '100%' }}
                            data={selectedGroup.LaphineData.TargetItems}
                            itemContent={(index, target) => (
                              <div
                                key={index}
                                className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60 hover:bg-gray-800/50"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-gray-500">
                                    #{index + 1}
                                  </span>
                                  <span className="text-sm font-medium text-gray-200">
                                    {target.Item}
                                  </span>
                                </div>
                                <button
                                  onClick={() => removeTargetItem(index)}
                                  className="text-gray-500 hover:text-rose-400 p-1 transition-colors"
                                  title={
                                    (t('random_options_manager.remove' as any) as string) ||
                                    'Remove'
                                  }
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-xs text-gray-500">
                            No target items linked. Use "Add Target Item" above.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select or create a Random Options Group on the left.
            </div>
          )}
        </div>
      </div>

      {/* ReferencePicker Modal for Applicator Item */}
      <ReferencePicker
        isOpen={applicatorPickerOpen}
        onClose={() => setApplicatorPickerOpen(false)}
        onSelect={handleSelectApplicator}
        type="item"
        title={(t('random_options_manager.select_applicator' as any) as string) || 'Select Applicator Item'}
      />

      {/* ReferencePicker Modal for Target Equipment Items */}
      <ReferencePicker
        isOpen={targetPickerOpen}
        onClose={() => setTargetPickerOpen(false)}
        onSelect={handleSelectTargetItem}
        type="item"
        title={(t('random_options_manager.select_target' as any) as string) || 'Select Target Item'}
      />
    </div>
  );
};

export default RandomOptionsEditor;
