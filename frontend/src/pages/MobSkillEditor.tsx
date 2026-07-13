import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { Search, Plus, Trash2, ShieldAlert, Save, Info } from 'lucide-react';
import { ReferencePicker } from '../components/ReferencePicker';
import { PercentBadge } from '../components/PercentBadge';
import { useLanguageStore } from '../store/useLanguageStore';

const STATES = ['any','idle','walk','dead','loot','attack','angry','chase','follow','anytarget'];
const TARGETS = [
  'target','self','friend','master','randomtarget',
  'around1','around2','around3','around4',
  'around5','around6','around7','around8','around',
];
const CONDITIONS = [
  'always','onspawn','myhpltmaxrate','myhpinrate',
  'mystatuson','mystatusoff','friendhpltmaxrate','friendhpinrate',
  'friendstatuson','friendstatusoff','attackpcgt','attackpcge',
  'slavelt','slavele','closedattacked','longrangeattacked',
  'skillused','afterskill','casttargeted','rudeattacked',
  'mobnearbygt','groundattacked','damagedgt','alchemist',
  'trickcasting',
];
const STATUS_ABNORM = [
  'anybad','stone','freeze','stun','sleep','poison',
  'curse','silence','confusion','blind','hiding','sight',
];
// Removed static CONDITION_HELP since it is now loaded dynamically from i18n store.

const EMOTIONS = [
  { v: -1, label: 'None (-1)' },
  { v: 0, label: '0 - /e1 (joy)' },
  { v: 1, label: '1 - /e2 (pained)' },
  { v: 2, label: '2 - /e3 (angry)' },
  { v: 3, label: '3 - /e4 (stunned)' },
  { v: 4, label: '4 - /e5 (like)' },
  { v: 5, label: '5 - /e6 (hmm)' },
  { v: 6, label: '6 - /e7 (no)' },
  { v: 7, label: '7 - /e8 (surprise)' },
  { v: 8, label: '8 - /e9 (hi)' },
  { v: 9, label: '9 - /e10 (swt)' },
  { v: 10, label: '10 - /e11 (mememe)' },
  { v: 11, label: '11 - /e12 (eyes)' },
  { v: 12, label: '12 - /e13 (question)' },
  { v: 13, label: '13 - /e14 (ecrit)' },
  { v: 14, label: '14 - /e15 (heh)' },
  { v: 15, label: '15 - /e16 (swt2)' },
  { v: 16, label: '16 - /e17 (profusely)' },
  { v: 17, label: '17 - /e18 (sob)' },
  { v: 18, label: '18 - /e19 (gawi)' },
  { v: 19, label: '19 - /e20 (scissors)' },
  { v: 20, label: '20 - /e21 (rock)' },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-400 flex items-center gap-1">
        {label}
        {hint && (
          <span className="group relative">
            <Info size={11} className="text-gray-600 hover:text-gray-400 cursor-help" />
            <span className="hidden group-hover:block absolute z-50 left-4 -top-1 w-64 bg-[#1e1e2e] border border-white/10 text-[11px] text-gray-300 rounded-lg p-2 shadow-xl leading-snug">
              {hint}
            </span>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputCls = "bg-dark-900 border border-dark-700 rounded px-3 py-1.5 text-sm text-white w-full focus:outline-none focus:border-red-500/60";
const selectCls = inputCls;

export const MobSkillEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [mobSkills, setMobSkills] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(t('mob_skill_editor.status.loading'));
  const [selectedMobId, setSelectedMobId] = useState<number | null>(null);
  const [selectedMobName, setSelectedMobName] = useState<string>("");
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number | null>(null);
  const [mobSearchText, setMobSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ok: boolean; text: string} | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'mob' | 'skill'>('skill');

  useEffect(() => { fetchMobSkills(); }, []);

  const fetchMobSkills = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_URL}/api/mob_skills/`);
      setMobSkills(res.data.skills || []);
    } catch (err) {
      console.error("Erro ao carregar mob skills:", err);
      setLoadingStatus(t('mob_skill_editor.status.error_fetching'));
    } finally {
      setIsLoading(false);
    }
  };

  const uniqueMobs = useMemo(() => {
    const map = new Map<number, string>();
    mobSkills.forEach(s => {
      const id = s.mob_id || 0;
      if (!map.has(id)) map.set(id, s.dummy_name || t('mob_skill_editor.sidebar.monster_number', { id }));
    });
    if (selectedMobId !== null && !map.has(selectedMobId))
      map.set(selectedMobId, selectedMobName || t('mob_skill_editor.sidebar.monster_number', { id: selectedMobId }));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [mobSkills, selectedMobId, selectedMobName, t]);

  const filteredMobs = useMemo(() => {
    if (!mobSearchText.trim()) return uniqueMobs;
    const q = mobSearchText.toLowerCase();
    return uniqueMobs.filter(m => String(m.id).includes(q) || m.name.toLowerCase().includes(q));
  }, [uniqueMobs, mobSearchText]);

  const skillsForSelectedMob = useMemo(() =>
    selectedMobId === null ? [] : mobSkills.filter(s => s.mob_id === selectedMobId),
    [mobSkills, selectedMobId]);

  const selectedSkillEntry = useMemo(() =>
    selectedSkillIndex === null ? null : mobSkills.find(s => s._line_index === selectedSkillIndex) || null,
    [mobSkills, selectedSkillIndex]);

  const upd = (field: string, value: any) => {
    if (selectedSkillIndex === null) return;
    setMobSkills(prev => prev.map(s =>
      s._line_index === selectedSkillIndex ? { ...s, [field]: value } : s
    ));
  };

  const handleSaveSkill = async () => {
    if (!selectedSkillEntry) return;
    setIsSaving(true);
    setSaveMsg(null);
    try {
      const res = await axios.put(`${API_URL}/api/mob_skills/${selectedSkillEntry._line_index}`, {
        data: selectedSkillEntry
      });
      // Sync updated entry from backend response
      if (res.data && res.data._line_index !== undefined) {
        setMobSkills(prev => prev.map(s =>
          s._line_index === selectedSkillEntry._line_index ? { ...res.data } : s
        ));
      }
      setSaveMsg({ ok: true, text: t('mob_skill_editor.save_success') });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      console.error("Erro ao salvar habilidade:", err);
      setSaveMsg({ ok: false, text: t('mob_skill_editor.save_error') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewSkillToMob = async () => {
    if (selectedMobId === null) return;
    try {
      const newEntry = {
        mob_id: selectedMobId,
        dummy_name: uniqueMobs.find(m => m.id === selectedMobId)?.name || selectedMobName || t('mob_skill_editor.sidebar.monster_number', { id: selectedMobId }),
        state: 'idle', skill_id: 1, skill_lv: 1,
        rate: 1000, cast_time: 0, delay: 5000, cancelable: false,
        target: 'target', condition_type: 'always', condition_value: 0,
        val1: 0, val2: 0, val3: 0, val4: 0, val5: 0, emotion: -1, chat: ''
      };
      const res = await axios.post(`${API_URL}/api/mob_skills/`, { data: newEntry });
      setMobSkills(prev => [...prev, res.data]);
      setSelectedSkillIndex(res.data._line_index);
    } catch (err) {
      console.error("Erro ao criar habilidade:", err);
      alert(t('mob_skill_editor.create_error'));
    }
  };

  const handleDeleteSkill = async (index: number, source: string) => {
    if (!confirm(t('mob_skill_editor.delete_confirm'))) return;
    try {
      await axios.delete(`${API_URL}/api/mob_skills/${index}?source=${source}`);
      setMobSkills(prev => prev.filter(s => s._line_index !== index));
      if (selectedSkillIndex === index) setSelectedSkillIndex(null);
    } catch (err) {
      console.error("Erro ao deletar habilidade:", err);
      alert(t('mob_skill_editor.delete_error'));
    }
  };

  const s = selectedSkillEntry;
  const condHint = s ? t('mob_skill_editor.conditions.' + s.condition_type as any) : undefined;

  return (
    <div className="flex h-full w-full bg-[#0d0d12] text-gray-200 overflow-hidden select-none font-sans">
      {/* Sidebar */}
      <div className="w-[280px] flex-shrink-0 flex flex-col bg-[#12121a] border-r border-white/5 shadow-xl">
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1a24] to-[#12121a]">
          <h2 className="text-gray-200 font-semibold text-sm flex items-center gap-2 mb-3">
            <ShieldAlert size={16} className="text-red-500" /> {t('mob_skill_editor.sidebar.title')}
          </h2>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder={t('mob_skill_editor.sidebar.search_placeholder')} value={mobSearchText}
              onChange={e => setMobSearchText(e.target.value)}
              className="w-full bg-dark-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50" />
          </div>
          <button onClick={() => { setPickerTarget('mob'); setPickerOpen(true); }}
            className="w-full py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
            <Plus size={13} /> {t('mob_skill_editor.sidebar.add_mob')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">{loadingStatus}</div>
          ) : filteredMobs.map(m => (
            <div key={m.id}
              onClick={() => { setSelectedMobId(m.id); setSelectedMobName(m.name); setSelectedSkillIndex(null); }}
              className={`p-3 cursor-pointer transition-colors flex flex-col ${
                selectedMobId === m.id ? 'bg-red-500/20 border-l-2 border-red-500' : 'hover:bg-white/5'}`}>
              <span className="text-xs font-semibold truncate text-gray-100">{m.name}</span>
              <span className="text-[10px] text-gray-500 font-mono">ID: {m.id}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Middle: Skills List */}
      <div className="w-[320px] flex-shrink-0 flex flex-col bg-[#15151f] border-r border-white/5">
        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-[#181824]">
          <span className="text-sm font-bold text-gray-200">{t('mob_skill_editor.list.title')}</span>
          {selectedMobId !== null && (
            <button onClick={handleAddNewSkillToMob} title="Adicionar skill"
              className="p-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors">
              <Plus size={15} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {selectedMobId === null ? (
            <p className="text-center py-10 text-gray-500 text-xs italic">{t('mob_skill_editor.list.select_mob')}</p>
          ) : skillsForSelectedMob.length === 0 ? (
            <p className="text-center py-10 text-gray-500 text-xs italic">{t('mob_skill_editor.list.no_skills')}</p>
          ) : skillsForSelectedMob.map((sk, idx) => {
            const sel = selectedSkillIndex === sk._line_index;
            const isCustom = sk._source === 'custom';
            return (
              <div key={sk._line_index ?? idx} onClick={() => setSelectedSkillIndex(sk._line_index)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  sel ? (isCustom ? 'bg-emerald-500/10 border-emerald-500' : 'bg-red-500/10 border-red-500')
                      : 'bg-dark-900/60 border-dark-800 hover:border-dark-600'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-amber-400 font-mono">Skill {sk.skill_id} Lv{sk.skill_lv}</span>
                  <span className={`text-[9px] px-1.5 rounded font-mono ${isCustom ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-800 text-gray-400'}`}>
                    {isCustom ? 'import' : 'rAthena'}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 flex justify-between">
                  <span>{sk.state}</span>
                  <span>{Number(((sk.rate ?? 0) / 100).toFixed(2))}%</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{sk.condition_type}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Detail Editor */}
      <div className="flex-1 overflow-y-auto p-5 bg-dark-950">
        {s ? (
          <div className="max-w-2xl space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b border-dark-800">
              <div>
                <h1 className="text-base font-bold text-white">{t('mob_skill_editor.detail.title')}</h1>
                <p className="text-xs font-mono text-gray-500 mt-0.5">
                  Mob #{s.mob_id} ({s.dummy_name}) · {t('common.line')} {s._line_index} · {s._source === 'custom' ? 'import' : 'rAthena'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {saveMsg && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${saveMsg.ok ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                    {saveMsg.text}
                  </span>
                )}
                <button onClick={() => handleDeleteSkill(s._line_index, s._source)}
                  className="text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-600/20 flex items-center gap-1.5 transition-colors">
                  <Trash2 size={13} /> {t('common.delete')}
                </button>
                <button onClick={handleSaveSkill} disabled={isSaving}
                  className="text-xs px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-red-900/30 transition-all disabled:opacity-50">
                  <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>

            {/* Core fields */}
            <div>
              <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wider mb-3">{t('mob_skill_editor.detail.sections.identification')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('mob_skill_editor.fields.skill_id')} hint={t('mob_skill_editor.fields.skill_id_hint')}>
                  <div className="flex gap-1">
                    <input type="number" value={s.skill_id ?? 0}
                      onChange={e => upd('skill_id', parseInt(e.target.value) || 0)}
                      className={inputCls} />
                    <button onClick={() => { setPickerTarget('skill'); setPickerOpen(true); }}
                      className="px-2 rounded bg-dark-800 hover:bg-dark-700 text-gray-400 text-xs border border-dark-700 transition-colors whitespace-nowrap">
                      🔍
                    </button>
                  </div>
                </Field>
                <Field label={t('mob_skill_editor.fields.skill_lv')} hint={t('mob_skill_editor.fields.skill_lv_hint')}>
                  <input type="number" min={1} max={10} value={s.skill_lv ?? 1}
                    onChange={e => upd('skill_lv', parseInt(e.target.value) || 1)}
                    className={inputCls} />
                </Field>
              </div>
            </div>

            {/* Behavior */}
            <div>
              <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wider mb-3">{t('mob_skill_editor.detail.sections.behavior')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('mob_skill_editor.fields.state')} hint={t('mob_skill_editor.fields.state_hint')}>
                  <select value={s.state ?? 'idle'} onChange={e => upd('state', e.target.value)} className={selectCls}>
                    {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </Field>
                <Field label={t('mob_skill_editor.fields.target')} hint={t('mob_skill_editor.fields.target_hint')}>
                  <select value={s.target ?? 'target'} onChange={e => upd('target', e.target.value)} className={selectCls}>
                    {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <PercentBadge label={t('mob_skill_editor.fields.rate')} value={s.rate ?? 1000}
                  onChange={v => upd('rate', v)} scale={100} max={10000} />
                <Field label={t('mob_skill_editor.fields.cancelable')} hint={t('mob_skill_editor.fields.cancelable_hint')}>
                  <select value={s.cancelable ? 'yes' : 'no'}
                    onChange={e => upd('cancelable', e.target.value === 'yes')} className={selectCls}>
                    <option value="no">no</option>
                    <option value="yes">yes</option>
                  </select>
                </Field>
                <Field label={t('mob_skill_editor.fields.cast_time')} hint={t('mob_skill_editor.fields.cast_time_hint')}>
                  <input type="number" min={0} value={s.cast_time ?? 0}
                    onChange={e => upd('cast_time', parseInt(e.target.value) || 0)}
                    className={inputCls} />
                </Field>
                <Field label={t('mob_skill_editor.fields.delay')} hint={t('mob_skill_editor.fields.delay_hint')}>
                  <input type="number" min={0} value={s.delay ?? 5000}
                    onChange={e => upd('delay', parseInt(e.target.value) || 0)}
                    className={inputCls} />
                </Field>
              </div>
            </div>

            {/* Condition */}
            <div>
              <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wider mb-3">{t('mob_skill_editor.detail.sections.condition')}</p>
              {condHint && (
                <div className="mb-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-[11px] text-blue-300 flex items-start gap-2">
                  <Info size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{condHint}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('mob_skill_editor.fields.condition_type')} hint={t('mob_skill_editor.fields.condition_type_hint')}>
                  <select value={s.condition_type ?? 'always'} onChange={e => upd('condition_type', e.target.value)} className={selectCls}>
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label={t('mob_skill_editor.fields.condition_val')} hint={t('mob_skill_editor.fields.condition_val_hint')}>
                  <input type="number" value={s.condition_value ?? 0}
                    onChange={e => upd('condition_value', parseInt(e.target.value) || 0)}
                    className={inputCls} />
                </Field>
              </div>
              {/* status condition extra */}
              {(s.condition_type === 'mystatuson' || s.condition_type === 'mystatusoff' ||
                s.condition_type === 'friendstatuson' || s.condition_type === 'friendstatusoff') && (
                <div className="mt-2">
                  <p className="text-[10px] text-gray-500 mb-1">{t('mob_skill_editor.fields.valid_status')}</p>
                  <div className="flex flex-wrap gap-1">
                    {STATUS_ABNORM.map(ab => (
                      <span key={ab} className="text-[10px] font-mono bg-dark-800 text-gray-400 px-1.5 py-0.5 rounded cursor-pointer hover:bg-dark-700 hover:text-white transition-colors"
                        onClick={() => upd('condition_value', ab)}>
                        {ab}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Val1-Val5 */}
            <div>
              <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wider mb-3">
                {t('mob_skill_editor.detail.sections.additional_params')}
              </p>
              {s.condition_type === 'myhpinrate' || s.condition_type === 'friendhpinrate' ? (
                <p className="text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded p-2 mb-2">
                  {t('mob_skill_editor.fields.hp_condition_warning')}
                </p>
              ) : null}
              <div className="grid grid-cols-5 gap-2">
                {(['val1','val2','val3','val4','val5'] as const).map((v, i) => (
                  <Field key={v} label={`Val${i+1}`}>
                    <input type="number" value={(s as any)[v] ?? 0}
                      onChange={e => upd(v, parseInt(e.target.value) || 0)}
                      className={inputCls + ' font-mono text-center'} />
                  </Field>
                ))}
              </div>
            </div>

            {/* Emotion & Chat */}
            <div>
              <p className="text-[11px] text-gray-500 uppercase font-bold tracking-wider mb-3">{t('mob_skill_editor.detail.sections.expression')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('mob_skill_editor.fields.emotion')} hint={t('mob_skill_editor.fields.emotion_hint')}>
                  <select value={s.emotion ?? -1}
                    onChange={e => upd('emotion', parseInt(e.target.value))} className={selectCls}>
                    {EMOTIONS.map(em => <option key={em.v} value={em.v}>{em.label}</option>)}
                  </select>
                </Field>
                <Field label={t('mob_skill_editor.fields.chat')} hint={t('mob_skill_editor.fields.chat_hint')}>
                  <input type="text" value={s.chat ?? ''}
                    onChange={e => upd('chat', e.target.value)}
                    placeholder={t('mob_skill_editor.fields.chat_placeholder')}
                    className={inputCls} />
                </Field>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <ShieldAlert size={56} className="mb-4 opacity-15 text-red-500" />
            <h3 className="text-lg font-medium text-gray-400">{t('mob_skill_editor.no_selection.title')}</h3>
            <p className="text-sm mt-2 text-gray-500">{t('mob_skill_editor.no_selection.subtitle')}</p>
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
            setSelectedMobName(name);
          } else if (selectedSkillIndex !== null) {
            upd('skill_id', Number(id));
          }
        }}
      />
    </div>
  );
};

export default MobSkillEditor;
