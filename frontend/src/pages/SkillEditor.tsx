import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Virtuoso } from 'react-virtuoso';
import { API_URL } from '../config/env';
import { Search, Zap, Database, Sparkles, Save, Shield, Clock, Sliders, Box, Layers } from 'lucide-react';
import { LevelArrayEditor } from '../components/LevelArrayEditor';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';

type SourceTab = 'rathena' | 'custom';

export const SkillEditor: React.FC = () => {
  const [skills, setSkills] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Conectando ao Backend...");
  const [searchText, setSearchText] = useState("");
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'dano' | 'tempo' | 'requisitos' | 'unidade'>('geral');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerConfig, setPickerConfig] = useState<{ open: boolean; type: 'item' | 'mob' | 'skill'; targetKey?: string }>({ open: false, type: 'item' });

  useEffect(() => {
    let intervalId: any;
    const fetchSkills = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/skills/?limit=100000`);
        setSkills(res.data.skills || []);
        setIsLoading(false);
      } catch (err) {
        console.error("Erro ao carregar skills:", err);
        setLoadingStatus("Erro ao carregar banco de habilidades.");
      }
    };

    const checkStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/skills/status`);
        setLoadingStatus(res.data.message);
        if (!res.data.is_loading && res.data.message !== "Aguardando inicialização...") {
          if (intervalId) clearInterval(intervalId);
          fetchSkills();
        }
      } catch (err) {
        setLoadingStatus("Verificando servidor...");
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 1500);
    return () => clearInterval(intervalId);
  }, []);

  const rathenaSkills = useMemo(() => skills.filter(s => s._source === 'rathena'), [skills]);
  const customSkills = useMemo(() => skills.filter(s => s._source === 'custom'), [skills]);

  const filteredSkills = useMemo(() => {
    const list = sourceTab === 'rathena' ? rathenaSkills : customSkills;
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(s => 
      String(s.Id).includes(q) || 
      String(s.Name || '').toLowerCase().includes(q) ||
      String(s.Description || '').toLowerCase().includes(q)
    );
  }, [rathenaSkills, customSkills, sourceTab, searchText]);

  const selectedSkill = useMemo(() => {
    return skills.find(s => s.Id === selectedSkillId) || null;
  }, [skills, selectedSkillId]);

  const handleUpdateField = (fieldKey: string, value: any) => {
    if (!selectedSkill) return;
    setSkills(prev => prev.map(s => {
      if (s.Id === selectedSkill.Id) {
        return { ...s, [fieldKey]: value };
      }
      return s;
    }));
  };

  const handleUpdateNestedField = (parentKey: string, childKey: string, value: any) => {
    if (!selectedSkill) return;
    setSkills(prev => prev.map(s => {
      if (s.Id === selectedSkill.Id) {
        const parent = { ...(s[parentKey] || {}) };
        parent[childKey] = value;
        return { ...s, [parentKey]: parent };
      }
      return s;
    }));
  };

  const handleSave = async () => {
    if (!selectedSkill) return;
    setIsSaving(true);
    try {
      const res = await axios.put(`${API_URL}/api/skills/${selectedSkill.Id}`, {
        data: selectedSkill
      });
      const saved = res.data;
      setSkills(prev => prev.map(s => s.Id === saved.Id ? { ...saved, _source: 'custom' } : s));
      setSourceTab('custom');
      alert("Habilidade salva com sucesso em db/import/skill_db.yml!");
    } catch (err) {
      console.error("Erro ao salvar skill:", err);
      alert("Erro ao salvar habilidade.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-200 font-semibold text-lg flex items-center gap-2">
              <Zap size={18} className="text-amber-500" /> Habilidades
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3 bg-dark-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => { setSourceTab('rathena'); setSelectedSkillId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'rathena'
                  ? 'bg-amber-600/80 text-white shadow-md shadow-amber-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Database size={12} /> rAthena
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {rathenaSkills.length.toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => { setSourceTab('custom'); setSelectedSkillId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 ${
                sourceTab === 'custom'
                  ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Sparkles size={12} /> Custom
              <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'}`}>
                {customSkills.length.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por ID ou AegisName..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-gray-500 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
              <span className="text-xs">{loadingStatus}</span>
            </div>
          ) : (
            <Virtuoso
              data={filteredSkills}
              style={{ height: '100%' }}
              itemContent={(index, skill) => {
                const isSelected = selectedSkillId === skill.Id;
                const isCustom = skill._source === 'custom';
                return (
                  <div
                    onClick={() => setSelectedSkillId(skill.Id)}
                    className={`flex items-center justify-between p-3 cursor-pointer border-b border-white/5 transition-all duration-150 ${
                      isSelected
                        ? isCustom
                          ? 'bg-gradient-to-r from-emerald-600/20 to-transparent border-l-2 border-l-emerald-500'
                          : 'bg-gradient-to-r from-amber-600/20 to-transparent border-l-2 border-l-amber-500'
                        : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-sm truncate font-medium ${isSelected ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {skill.Description || skill.Name || `Skill #${skill.Id}`}
                      </span>
                      <span className={`text-[11px] truncate font-mono ${isSelected ? (isCustom ? 'text-emerald-300' : 'text-amber-300') : 'text-gray-500'}`}>
                        #{skill.Id} — {skill.Name}
                      </span>
                    </div>
                    <span className="text-[10px] bg-dark-900 text-gray-400 font-mono px-1.5 py-0.5 rounded border border-white/5">
                      Lv {skill.MaxLevel || 1}
                    </span>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-dark-950 flex flex-col overflow-hidden relative">
        {selectedSkill ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-[#12121a]/80 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                    ID: {selectedSkill.Id}
                  </span>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${selectedSkill._source === 'custom' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-dark-800 text-gray-400'}`}>
                    {selectedSkill._source === 'custom' ? 'Custom Import' : 'rAthena Original'}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-white mt-1">
                  {selectedSkill.Description || selectedSkill.Name}
                </h1>
                <span className="text-xs font-mono text-gray-400">{selectedSkill.Name}</span>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-semibold px-4 py-2 rounded-lg shadow-lg shadow-amber-900/30 transition-all disabled:opacity-50"
              >
                <Save size={16} />
                <span>{isSaving ? "Salvar em db/import/..." : "Salvar em db/import/..."}</span>
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-dark-800 bg-dark-900/40 px-4 gap-4">
              {[
                { id: 'geral', label: 'Identificação e Geral', icon: Sliders },
                { id: 'dano', label: 'Dano e Combate', icon: Shield },
                { id: 'tempo', label: 'Cast, Delay e Cooldown', icon: Clock },
                { id: 'requisitos', label: 'Requisitos e Custos', icon: Layers },
                { id: 'unidade', label: 'Efeitos no Solo (Unit)', icon: Box },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-amber-500 text-amber-400'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'geral' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">AegisName (Código interno)</label>
                    <input
                      type="text"
                      value={selectedSkill.Name || ''}
                      onChange={(e) => handleUpdateField('Name', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">Descrição Exibida</label>
                    <input
                      type="text"
                      value={selectedSkill.Description || ''}
                      onChange={(e) => handleUpdateField('Description', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">Nível Máximo (MaxLevel)</label>
                    <input
                      type="number"
                      value={selectedSkill.MaxLevel || 1}
                      onChange={(e) => handleUpdateField('MaxLevel', parseInt(e.target.value) || 1)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">Tipo da Habilidade (Type)</label>
                    <select
                      value={selectedSkill.Type || 'None'}
                      onChange={(e) => handleUpdateField('Type', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    >
                      {['None', 'Weapon', 'Magic', 'Misc'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">Alvo (TargetType)</label>
                    <select
                      value={selectedSkill.TargetType || 'Passive'}
                      onChange={(e) => handleUpdateField('TargetType', e.target.value)}
                      className="bg-dark-900 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                    >
                      {['Passive', 'Attack', 'Target', 'Ground', 'Self', 'Friend', 'Party', 'Guild'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">Alcance (Range)</label>
                    <LevelArrayEditor
                      label="Alcance (Células)"
                      value={selectedSkill.Range}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Size"
                      onChange={(val) => handleUpdateField('Range', val)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'dano' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LevelArrayEditor
                      label="Contagem de Acertos (HitCount)"
                      value={selectedSkill.HitCount}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Count"
                      onChange={(val) => handleUpdateField('HitCount', val)}
                    />
                    <LevelArrayEditor
                      label="Área de Splash (SplashArea)"
                      value={selectedSkill.SplashArea}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Area"
                      onChange={(val) => handleUpdateField('SplashArea', val)}
                    />
                    <LevelArrayEditor
                      label="Empurrão — Knockback (Células)"
                      value={selectedSkill.Knockback}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Amount"
                      onChange={(val) => handleUpdateField('Knockback', val)}
                    />
                    <div className="flex flex-col gap-1 bg-dark-900/50 p-3 rounded border border-dark-800">
                      <label className="text-xs font-medium text-gray-300 mb-1">Tipo de Acerto (Hit)</label>
                      <select
                        value={selectedSkill.Hit || 'Normal'}
                        onChange={(e) => handleUpdateField('Hit', e.target.value)}
                        className="bg-dark-950 border border-dark-700 rounded px-3 py-2 text-sm text-white"
                      >
                        {['Normal', 'Single', 'Multi_Hit'].map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tempo' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LevelArrayEditor
                    label="Tempo de Conjuração — CastTime (ms)"
                    value={selectedSkill.CastTime}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('CastTime', val)}
                  />
                  <LevelArrayEditor
                    label="Cast Fixo — FixedCastTime (ms)"
                    value={selectedSkill.FixedCastTime}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('FixedCastTime', val)}
                  />
                  <LevelArrayEditor
                    label="Pós-conjuração (Animação) — AfterCastActDelay (ms)"
                    value={selectedSkill.AfterCastActDelay}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('AfterCastActDelay', val)}
                  />
                  <LevelArrayEditor
                    label="Tempo de Recarga — Cooldown (ms)"
                    value={selectedSkill.Cooldown}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('Cooldown', val)}
                  />
                  <LevelArrayEditor
                    label="Duração 1 (ms)"
                    value={selectedSkill.Duration1}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('Duration1', val)}
                  />
                  <LevelArrayEditor
                    label="Duração 2 (ms)"
                    value={selectedSkill.Duration2}
                    maxLevel={selectedSkill.MaxLevel || 10}
                    valueKey="Time"
                    onChange={(val) => handleUpdateField('Duration2', val)}
                  />
                </div>
              )}

              {activeTab === 'requisitos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LevelArrayEditor
                      label="Custo de SP (SpCost)"
                      value={selectedSkill.Requires?.SpCost}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Amount"
                      onChange={(val) => handleUpdateNestedField('Requires', 'SpCost', val)}
                    />
                    <LevelArrayEditor
                      label="Custo de HP (HpCost)"
                      value={selectedSkill.Requires?.HpCost}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Amount"
                      onChange={(val) => handleUpdateNestedField('Requires', 'HpCost', val)}
                    />
                    <LevelArrayEditor
                      label="Custo de Zeny (ZenyCost)"
                      value={selectedSkill.Requires?.ZenyCost}
                      maxLevel={selectedSkill.MaxLevel || 10}
                      valueKey="Amount"
                      onChange={(val) => handleUpdateNestedField('Requires', 'ZenyCost', val)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'unidade' && (
                <div className="bg-dark-900/40 p-4 rounded-lg border border-dark-800 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">Configuração de Efeito no Solo (Unit / Splash / Area)</h3>
                  <p className="text-xs text-gray-500">
                    Defina propriedades de magias ou habilidades que permanecem no chão após conjuradas (ex: Barreira de Fogo, Santuário).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-400">Instâncias Ativas Máximas (ActiveInstance)</label>
                      <LevelArrayEditor
                        label="Max Instâncias no Solo"
                        value={selectedSkill.ActiveInstance}
                        maxLevel={selectedSkill.MaxLevel || 10}
                        valueKey="Max"
                        onChange={(val) => handleUpdateField('ActiveInstance', val)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Zap size={64} className="mb-4 opacity-20 text-amber-500" />
            <h3 className="text-xl font-medium text-gray-400">Nenhuma Habilidade Selecionada</h3>
            <p className="text-sm mt-2">Selecione uma habilidade na lista ao lado para ver e editar seus parâmetros.</p>
          </div>
        )}
      </div>

      <ReferencePicker
        isOpen={pickerConfig.open}
        onClose={() => setPickerConfig({ ...pickerConfig, open: false })}
        type={pickerConfig.type}
        onSelect={(id, name) => {
          // Can be used to inject item requirements
        }}
      />
    </div>
  );
};

export default SkillEditor;
