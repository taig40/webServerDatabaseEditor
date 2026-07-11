import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { Sparkles, Save, Code2 } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const selectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    background: '#12121a',
    borderColor: state.isFocused ? '#06b6d4' : '#374151',
    boxShadow: 'none',
    color: '#e5e7eb',
    '&:hover': { borderColor: '#4b5563' }
  }),
  menu: (base: any) => ({
    ...base,
    background: '#1a1a24',
    border: '1px solid #374151',
    zIndex: 50
  }),
  menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
    color: state.isFocused ? '#67e8f9' : '#9ca3af',
    cursor: 'pointer',
    '&:active': { backgroundColor: 'rgba(6, 182, 212, 0.3)' }
  }),
  singleValue: (base: any) => ({ ...base, color: '#67e8f9' }),
  input: (base: any) => ({ ...base, color: '#e5e7eb' })
};

const commonMaps = [
  { value: 'prontera', label: 'prontera' },
  { value: 'morocc', label: 'morocc' },
  { value: 'geffen', label: 'geffen' },
  { value: 'payon', label: 'payon' },
  { value: 'alberta', label: 'alberta' },
  { value: 'izlude', label: 'izlude' },
  { value: 'aldebaran', label: 'aldebaran' },
  { value: 'xmas', label: 'xmas' },
  { value: 'comodo', label: 'comodo' },
  { value: 'yuno', label: 'yuno' },
  { value: 'amatsu', label: 'amatsu' },
  { value: 'gonryun', label: 'gonryun' },
  { value: 'umbala', label: 'umbala' },
  { value: 'ayothaya', label: 'ayothaya' }
];

export const SpawnEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  
  const [mobOptions, setMobOptions] = useState<{value: string, label: string, name: string}[]>([]);
  const [isLoadingMobs, setIsLoadingMobs] = useState(false);
  
  // Form State
  const [mapname, setMapname] = useState('prontera');
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  
  const [mobId, setMobId] = useState<string>('');
  const [mobName, setMobName] = useState<string>('');
  
  const [amount, setAmount] = useState(1);
  const [delay1, setDelay1] = useState(0);
  const [delay2, setDelay2] = useState(0);
  const [event, setEvent] = useState('');

  const [isInjecting, setIsInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<{success: boolean, msg: string} | null>(null);

  useEffect(() => {
    fetchMobs();
  }, []);

  const fetchMobs = async () => {
    setIsLoadingMobs(true);
    try {
      const res = await axios.get(`${API_URL}/api/mobs/?limit=50000`);
      const mobs = res.data.mobs || [];
      const opts = mobs.map((mob: any) => {
        const dName = mob.Name || mob.AegisName || mob.Id;
        return {
          value: mob.AegisName || mob.Id.toString(),
          label: `${dName} (${mob.AegisName || mob.Id})`,
          name: dName
        };
      });
      setMobOptions(opts);
    } catch (err) {
      console.error("Erro ao carregar mapa de monstros:", err);
    }
    setIsLoadingMobs(false);
  };

  const handleMobChange = (selected: any) => {
    if (selected) {
      setMobId(selected.value);
      setMobName(selected.name);
    } else {
      setMobId('');
      setMobName('');
    }
  };

  const handleInject = async () => {
    if (!mapname || !mobId) return;
    setIsInjecting(true);
    setInjectResult(null);

    const payload = {
      mapname,
      x, y, rx, ry,
      mobid: mobId,
      mobname: mobName,
      amount,
      delay1, delay2,
      event
    };

    try {
      await axios.post(`${API_URL}/api/scripts/custom-spawns`, payload);
      setInjectResult({ success: true, msg: t('inject_success') });
      setTimeout(() => setInjectResult(null), 3000);
    } catch (err: any) {
      setInjectResult({ success: false, msg: err.response?.data?.detail || t('inject_error') });
    }
    setIsInjecting(false);
  };

  const eventStr = event ? `,${event}` : '';
  const rawCode = `${mapname},${x},${y},${rx},${ry}\tmonster\t${mobName || 'Unknown'}\t${mobId || '0'},${amount},${delay1},${delay2}${eventStr}`;

  return (
    <div className="h-full flex flex-col bg-[#0b0b12] text-gray-200 p-6 overflow-hidden">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            {t('spawns_title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('spawns_subtitle')}
          </p>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* Lado Esquerdo - Form */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold text-cyan-300 mb-4 border-b border-gray-800 pb-2">
              {t('spawn_location_section')}
            </h2>
            
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                {t('spawn_map')}
              </label>
              <CreatableSelect
                styles={selectStyles}
                menuPortalTarget={document.body}
                options={commonMaps}
                value={{ label: mapname, value: mapname }}
                onChange={(v: any) => setMapname(v?.value || '')}
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_x')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={x} onChange={e => setX(parseInt(e.target.value) || 0)} min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_y')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={y} onChange={e => setY(parseInt(e.target.value) || 0)} min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_rx')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={rx} onChange={e => setRx(parseInt(e.target.value) || 0)} min={0}
                  disabled={x === 0 && y === 0}
                  title={x === 0 && y === 0 ? "Disabled when exact coords are 0" : ""}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_ry')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={ry} onChange={e => setRy(parseInt(e.target.value) || 0)} min={0}
                  disabled={x === 0 && y === 0}
                />
              </div>
            </div>
          </div>

          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold text-cyan-300 mb-4 border-b border-gray-800 pb-2">
              {t('spawn_entity_section')}
            </h2>
            
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                {t('spawn_monster')}
              </label>
              <Select
                styles={selectStyles}
                menuPortalTarget={document.body}
                options={mobOptions}
                isLoading={isLoadingMobs}
                placeholder={t('spawn_select_monster')}
                onChange={handleMobChange}
                value={mobOptions.find(o => o.value === mobId) || null}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_amount')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={amount} onChange={e => setAmount(parseInt(e.target.value) || 1)} min={1}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_event')}</label>
                <input 
                  type="text" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={event} onChange={e => setEvent(e.target.value)} placeholder="EventLabel"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_delay1')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={delay1} onChange={e => setDelay1(parseInt(e.target.value) || 0)} min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">{t('spawn_delay2')}</label>
                <input 
                  type="number" className="w-full bg-[#0b0b12] border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                  value={delay2} onChange={e => setDelay2(parseInt(e.target.value) || 0)} min={0}
                />
              </div>
            </div>

          </div>

        </div>

        {/* Lado Direito - Live Preview */}
        <div className="w-1/2 flex flex-col bg-[#12121a] border border-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-900 border-b border-gray-800 p-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              {t('spawn_live_preview_title')}
            </span>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-gray-500 mb-3">
              {t('spawn_live_preview_desc')}
            </p>
            <div className="rounded overflow-hidden border border-gray-800">
              <SyntaxHighlighter
                language="text"
                style={vscDarkPlus}
                customStyle={{ margin: 0, padding: '1rem', background: '#0b0b12' }}
              >
                {rawCode}
              </SyntaxHighlighter>
            </div>

            {injectResult && (
              <div className={`mt-4 p-3 rounded text-sm ${injectResult.success ? 'bg-green-900/40 text-green-400 border border-green-800/50' : 'bg-red-900/40 text-red-400 border border-red-800/50'}`}>
                {injectResult.msg}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-end">
            <button
              onClick={handleInject}
              disabled={isInjecting || !mapname || !mobId}
              className={`px-6 py-2 rounded font-medium flex items-center gap-2 transition-colors ${
                isInjecting || !mapname || !mobId
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20'
              }`}
            >
              <Save className="w-4 h-4" />
              {t('inject_button')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
