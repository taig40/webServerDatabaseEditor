import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { Search, Plus, Trash2, ShieldAlert, Save, Database, Sparkles } from 'lucide-react';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';

export const MobSkillEditor: React.FC = () => {
  const [mobSkills, setMobSkills] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Carregando habilidades de monstros...");
  const [selectedMobId, setSelectedMobId] = useState<number | null>(null);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number | null>(null);
  const [mobSearchText, setMobSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'mob' | 'skill'>('skill');

  useEffect(() => {
    fetchMobSkills();
  }, []);

  const fetchMobSkills = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/mob_skills/`);
      setMobSkills(res.data.skills || []);
      setIsLoading(false);
    } catch (err) {
      console.error("Erro ao carregar mob skills:", err);
      setLoadingStatus("Erro ao carregar habilidades de monstros.");
      setIsLoading(false);
    }
  };

  // Unique mob IDs from the loaded skills
  const uniqueMobs = useMemo(() => {
    const map = new Map<number, string>();
    mobSkills.forEach(s => {
      const id = s.mob_id || 0;
      if (!map.has(id)) {
        map.set(id, s.dummy_name || `Monstro #${id}`);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [mobSkills]);

  const filteredMobs = useMemo(() => {
    if (!mobSearchText.trim()) return uniqueMobs;
    const q = mobSearchText.toLowerCase();
    return uniqueMobs.filter(m => String(m.id).includes(q) || m.name.toLowerCase().includes(q));
  }, [uniqueMobs, mobSearchText]);

  const skillsForSelectedMob = useMemo(() => {
    if (selectedMobId === null) return [];
    return mobSkills.filter(s => s.mob_id === selectedMobId);
  }, [mobSkills, selectedMobId]);

  const selectedSkillEntry = useMemo(() => {
    if (selectedSkillIndex === null) return null;
    return mobSkills.find(s => s._line_index === selectedSkillIndex) || null;
  }, [mobSkills, selectedSkillIndex]);

  const handleUpdateEntryField = (field: string, value: any) => {
    if (selectedSkillIndex === null) return;
    setMobSkills(prev => prev.map(s => {
      if (s._line_index === selectedSkillIndex) {
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  const handleSaveSkill = async () => {
    if (!selectedSkillEntry) return;
    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/api/mob_skills/${selectedSkillEntry._line_index}`, {
        data: selectedSkillEntry
      });
      alert("Habilidade do monstro salva com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar habilidade do monstro:", err);
      alert("Erro ao salvar habilidade do monstro.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewSkillToMob = async () => {
    if (selectedMobId === null) return;
    try {
      const newEntry = {
        mob_id: selectedMobId,
        dummy_name: uniqueMobs.find(m => m.id === selectedMobId)?.name || '',
        state: 'idle',
        skill_id: 1,
        skill_lv: 1,
        rate: 1000,
        cast_time: 0,
        delay: 5000,
        cancelable: false,
        target: 'target',
        condition_type: 'always',
        condition_value: 0,
        val1: 0, val2: 0, val3: 0, val4: 0, val5: 0,
        emotion: -1,
        chat: ''
      };
      const res = await axios.post(`${API_URL}/api/mob_skills/`, { data: newEntry });
      const created = res.data;
      setMobSkills(prev => [...prev, created]);
      setSelectedSkillIndex(created._line_index);
    } catch (err) {
      console.error("Erro ao criar habilidade para monstro:", err);
      alert("Erro ao criar nova habilidade.");
    }
  };

  const handleDeleteSkill = async (index: number, source: string) => {
    if (!confirm("Deseja remover esta habilidade do monstro?")) return;
    try {
      await axios.delete(`${API_URL}/api/mob_skills/${index}?source=${source}`);
      setMobSkills(prev => prev.filter(s => s._line_index !== index));
      if (selectedSkillIndex === index) setSelectedSkillIndex(null);
    } catch (err) {
      console.error("Erro ao deletar habilidade:", err);
      alert("Erro ao deletar habilidade.");
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar - Mobs List */}
      <div className="w-[300px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <h2 className="text-gray-200 font-semibold text-base flex items-center gap-2 mb-3">
            <ShieldAlert size={18} className="text-red-500" /> Habilidade de Monstros
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar monstro (ID/Nome)..."
              value={mobSearchText}
              onChange={(e) => setMobSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50"
            />
          </div>
          <button
            type="button"
            onClick={() => { setPickerTarget('mob'); setPickerOpen(true); }}
            className="w-full mt-2 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus size={14} /> Adicionar Novo Monstro
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">{loadingStatus}</div>
          ) : filteredMobs.map(m => (
            <div
              key={m.id}
              onClick={() => { setSelectedMobId(m.id); setSelectedSkillIndex(null); }}
              className={`p-3 cursor-pointer transition-colors flex items-center justify-between ${
                selectedMobId === m.id
                  ? 'bg-red-500/20 border-l-2 border-red-500 text-white font-medium'
                  : 'hover:bg-dark-800/50 text-gray-300'
              }`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold truncate">{m.name}</span>
                <span className="text-[10px] text-gray-500 font-mono">ID: {m.id}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Panel - Skills of Selected Mob */}
      <div className="w-[360px] flex-shrink-0 flex flex-col bg-[#15151f] border-r border-white/5 shadow-xl">
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#181824]">
          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
            <span>Skills do Monstro</span>
          </h3>
          {selectedMobId !== null && (
            <button
              type="button"
              onClick={handleAddNewSkillToMob}
              className="p-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
              title="Adicionar habilidade a este monstro"
            >
              <Plus size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {selectedMobId === null ? (
            <div className="text-center py-12 text-gray-500 text-xs italic">
              Selecione um monstro na coluna à esquerda.
            </div>
          ) : skillsForSelectedMob.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs italic">
              Este monstro não possui habilidades cadastradas.
            </div>
          ) : (
            skillsForSelectedMob.map((s, idx) => {
              const isSelected = selectedSkillIndex === s._line_index;
              const isCustom = s._source === 'custom';
              return (
                <div
                  key={s._line_index || idx}
                  onClick={() => setSelectedSkillIndex(s._line_index)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? isCustom
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'bg-red-500/10 border-red-500 text-white'
                      : 'bg-dark-900/60 border-dark-800 hover:border-dark-700 text-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-amber-400 font-mono">
                      Skill ID: {s.skill_id} (Lv {s.skill_lv})
                    </span>
                    <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${isCustom ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-gray-400'}`}>
                      {isCustom ? 'Import' : 'rAthena'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>Estado: <b className="text-gray-300">{s.state}</b></span>
                    <span>Chance: <b className="text-gray-300">{(s.rate / 100).toFixed(0)}%</b></span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Detail Panel */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-y-auto p-6">
        {selectedSkillEntry ? (
          <div className="max-w-3xl space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-dark-800">
              <div>
                <h1 className="text-lg font-bold text-white">Editar Habilidade do Monstro</h1>
                <span className="text-xs font-mono text-gray-400">
                  Monstro: #{selectedSkillEntry.mob_id} ({selectedSkillEntry.dummy_name}) — Linha: {selectedSkillEntry._line_index}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteSkill(selectedSkillEntry._line_index, selectedSkillEntry._source)}
                  className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} /> Deletar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSkill}
                  disabled={isSaving}
                  className="bg-red-600 hover:bg-red-500 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-lg shadow-red-900/30 transition-all"
                >
                  <Save size={14} /> Salvar Alteração
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400 flex justify-between">
                  <span>ID da Habilidade (SkillID)</span>
                  <button
                    type="button"
                    onClick={() => { setPickerTarget('skill'); setPickerOpen(true); }}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    🔍 Buscar Skill
                  </button>
                </label>
                <input
                  type="number"
                  value={selectedSkillEntry.skill_id || 0}
                  onChange={(e) => handleUpdateEntryField('skill_id', parseInt(e.target.value) || 0)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm font-mono text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Nível da Habilidade (SkillLv)</label>
                <input
                  type="number"
                  value={selectedSkillEntry.skill_lv || 1}
                  onChange={(e) => handleUpdateEntryField('skill_lv', parseInt(e.target.value) || 1)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Estado de Ativação (State)</label>
                <select
                  value={selectedSkillEntry.state || 'idle'}
                  onChange={(e) => handleUpdateEntryField('state', e.target.value)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                >
                  {['any', 'idle', 'walk', 'dead', 'loot', 'attack', 'angry', 'chase', 'follow', 'anytarget'].map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <PercentBadge
                label="Chance de Conjuração (Rate)"
                value={selectedSkillEntry.rate || 1000}
                onChange={(val) => handleUpdateEntryField('rate', val)}
                scale={100}
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Tempo de Conjuração (CastTime — ms)</label>
                <input
                  type="number"
                  value={selectedSkillEntry.cast_time || 0}
                  onChange={(e) => handleUpdateEntryField('cast_time', parseInt(e.target.value) || 0)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Intervalo de Re-conjuração (Delay — ms)</label>
                <input
                  type="number"
                  value={selectedSkillEntry.delay || 0}
                  onChange={(e) => handleUpdateEntryField('delay', parseInt(e.target.value) || 0)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Alvo da Habilidade (Target)</label>
                <select
                  value={selectedSkillEntry.target || 'target'}
                  onChange={(e) => handleUpdateEntryField('target', e.target.value)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                >
                  {['target', 'self', 'friend', 'master', 'randomtarget', 'around1', 'around2', 'around3', 'around4', 'around5'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Tipo de Condição (ConditionType)</label>
                <select
                  value={selectedSkillEntry.condition_type || 'always'}
                  onChange={(e) => handleUpdateEntryField('condition_type', e.target.value)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                >
                  {['always', 'onspawn', 'myhpltmaxrate', 'myhpinrate', 'mystatuson', 'friendhpltmaxrate', 'closedattacked', 'longrangeattacked', 'skillused', 'afterskill', 'casttargeted'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">Valor da Condição (ConditionValue)</label>
                <input
                  type="number"
                  value={selectedSkillEntry.condition_value || 0}
                  onChange={(e) => handleUpdateEntryField('condition_value', parseInt(e.target.value) || 0)}
                  className="bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <ShieldAlert size={64} className="mb-4 opacity-20 text-red-500" />
            <h3 className="text-xl font-medium text-gray-400">Nenhuma Habilidade Selecionada</h3>
            <p className="text-sm mt-2">Selecione uma habilidade na coluna do meio para editar seus parâmetros.</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        type={pickerTarget === 'mob' ? 'mob' : 'skill'}
        onSelect={(id, name) => {
          if (pickerTarget === 'mob') {
            setSelectedMobId(Number(id));
          } else if (selectedSkillIndex !== null) {
            handleUpdateEntryField('skill_id', Number(id));
          }
        }}
      />
    </div>
  );
};

export default MobSkillEditor;
