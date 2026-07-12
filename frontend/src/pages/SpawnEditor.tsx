import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import { Sparkles, Save, Code2, MapPin, Swords, FileText, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { ReferencePicker } from '../components/ReferencePicker';

// ─── Estilo react-select ───────────────────────────────────────────────────────
const selectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    background: '#0d0d16',
    borderColor: state.isFocused ? '#06b6d4' : '#2d2d3d',
    boxShadow: 'none',
    color: '#e5e7eb',
    '&:hover': { borderColor: '#4b5563' }
  }),
  menu: (base: any) => ({
    ...base,
    background: '#12121e',
    border: '1px solid #2d2d3d',
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

// ─── Lista de mapas comuns ─────────────────────────────────────────────────────
const COMMON_MAPS = [
  'prontera','morocc','geffen','payon','alberta','izlude','aldebaran',
  'xmas','comodo','yuno','amatsu','gonryun','umbala','ayothaya',
  'rachel','veins','moscovia','brasilis','mid_camp','manuk','splendide',
  'dicastes01','mora','dewata','malangdo','malaya','eclage',
].map(m => ({ value: m, label: m }));

// ─── Componente Principal ──────────────────────────────────────────────────────
export const SpawnEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);

  // ── Form State ──────────────────────────────────────────────────────────────
  const [mapname, setMapname] = useState('prontera');
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  const [mobId, setMobId] = useState<string | number>('');
  const [mobName, setMobName] = useState('');
  const [amount, setAmount] = useState(1);
  const [delay1, setDelay1] = useState(0);
  const [delay2, setDelay2] = useState(0);
  const [event, setEvent] = useState('');

  // ── Picker State ────────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Feedback State ──────────────────────────────────────────────────────────
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<{ success: boolean; msg: string } | null>(null);

  // ── Viewer State ────────────────────────────────────────────────────────────
  const [viewerLines, setViewerLines] = useState<string[]>([]);
  const [viewerFilePath, setViewerFilePath] = useState('');
  const [isLoadingViewer, setIsLoadingViewer] = useState(false);

  // ─── Live Snippet gerado em tempo real (apenas para exibição) ────────────────
  // Formato exato exigido pelo rAthena: {map},{x},{y},{rx},{ry}\tmonster\t{mobname}\t{mobid},{amount},{delay1},{delay2}{,event}
  const liveSnippet = useMemo(() => {
    const eventStr = event.trim() ? `,${event.trim()}` : '';
    return `${mapname},${x},${y},${rx},${ry}\tmonster\t${mobName || 'Unknown'}\t${mobId || '0'},${amount},${delay1},${delay2}${eventStr}`;
  }, [mapname, x, y, rx, ry, mobName, mobId, amount, delay1, delay2, event]);

  // ─── Fetch do viewer ─────────────────────────────────────────────────────────
  const fetchViewer = useCallback(async () => {
    setIsLoadingViewer(true);
    try {
      const res = await axios.get(`${API_URL}/api/scripts/custom-spawns`);
      setViewerLines(res.data.lines || []);
      setViewerFilePath(res.data.file_path || '');
    } catch {
      // silencioso — arquivo pode não existir ainda
    } finally {
      setIsLoadingViewer(false);
    }
  }, []);

  useEffect(() => {
    fetchViewer();
  }, [fetchViewer]);

  // ─── Injetar Spawn ───────────────────────────────────────────────────────────
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
      setInjectResult({ success: true, msg: t('map_engine.inject_success' as any) });
      setTimeout(() => setInjectResult(null), 4000);
      fetchViewer();
    } catch (err: any) {
      setInjectResult({ success: false, msg: err.response?.data?.detail || t('map_engine.inject_error' as any) });
    } finally {
      setIsInjecting(false);
    }
  };

  const handlePickerSelect = (id: number | string, name: string) => {
    setMobId(name); // rAthena usa AegisName como referência
    setMobName(name);
    setPickerOpen(false);
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const inputCls = 'w-full bg-[#0b0b12] border border-[#2d2d3d] rounded-lg p-2.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none transition-colors placeholder-gray-600';
  const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

  return (
    <div className="h-full flex flex-col bg-[#090910] text-gray-200 p-6 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-cyan-400 flex items-center gap-2.5">
            <Sparkles className="w-6 h-6" />
            {t('map_engine.spawns_title' as any)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('map_engine.spawns_subtitle' as any)}
          </p>
        </div>
      </div>

      {/* ── Split View ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex gap-6 min-h-0">

        {/* ════════════════════════════ COLUNA ESQUERDA (Formulário) ═════════════ */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">

          {/* Card: Localização */}
          <div className="bg-[#0f0f1a] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-sm font-bold text-cyan-300 mb-4 flex items-center gap-2 border-b border-[#1e1e2e] pb-2.5">
              <MapPin className="w-4 h-4" />
              {t('map_engine.spawn_location_section' as any)}
            </h2>

            {/* Mapa */}
            <div className="mb-4">
              <label className={labelCls}>{t('map_engine.spawn_map' as any)}</label>
              <CreatableSelect
                styles={selectStyles}
                menuPortalTarget={document.body}
                options={COMMON_MAPS}
                value={{ label: mapname, value: mapname }}
                onChange={(v: any) => setMapname(v?.value || '')}
                formatCreateLabel={(inp: string) => `Usar "${inp}"`}
              />
            </div>

            {/* Coordenadas */}
            <div className="grid grid-cols-4 gap-3">
              {([
                ['spawn_x', x, setX],
                ['spawn_y', y, setY],
                ['spawn_rx', rx, setRx],
                ['spawn_ry', ry, setRy],
              ] as [string, number, (v: number) => void][]).map(([key, val, setter]) => (
                <div key={key}>
                  <label className={labelCls}>{t(`map_engine.${key}` as any)}</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={val}
                    onChange={e => setter(parseInt(e.target.value) || 0)}
                    min={0}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Card: Entidade */}
          <div className="bg-[#0f0f1a] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-sm font-bold text-cyan-300 mb-4 flex items-center gap-2 border-b border-[#1e1e2e] pb-2.5">
              <Swords className="w-4 h-4" />
              {t('map_engine.spawn_entity_section' as any)}
            </h2>

            {/* Monstro via ReferencePicker */}
            <div className="mb-4">
              <label className={labelCls}>{t('map_engine.spawn_monster' as any)}</label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  mobName
                    ? 'border-cyan-700 bg-cyan-950/30 text-cyan-300 font-mono'
                    : 'border-[#2d2d3d] bg-[#0b0b12] text-gray-500 hover:border-gray-500'
                }`}
              >
                {mobName || t('map_engine.select_mob' as any)}
              </button>
              {pickerOpen && (
                <ReferencePicker
                  isOpen={pickerOpen}
                  onClose={() => setPickerOpen(false)}
                  onSelect={handlePickerSelect}
                  type="mob"
                />
              )}
            </div>

            {/* Quantidade + Evento */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>{t('map_engine.spawn_amount' as any)}</label>
                <input type="number" className={inputCls} value={amount}
                  onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))} min={1} />
              </div>
              <div>
                <label className={labelCls}>{t('map_engine.spawn_event' as any)}</label>
                <input type="text" className={inputCls} value={event}
                  onChange={e => setEvent(e.target.value)} placeholder="EventLabel (opcional)" />
              </div>
            </div>

            {/* Delays */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('map_engine.spawn_delay1' as any)}</label>
                <input type="number" className={inputCls} value={delay1}
                  onChange={e => setDelay1(parseInt(e.target.value) || 0)} min={0} />
              </div>
              <div>
                <label className={labelCls}>{t('map_engine.spawn_delay2' as any)}</label>
                <input type="number" className={inputCls} value={delay2}
                  onChange={e => setDelay2(parseInt(e.target.value) || 0)} min={0} />
              </div>
            </div>
          </div>

          {/* Botão de Injeção */}
          <button
            onClick={handleInject}
            disabled={isInjecting || !mapname || !mobId}
            className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all text-sm ${
              isInjecting || !mapname || !mobId
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30 hover:shadow-cyan-900/50 active:scale-[0.98]'
            }`}
          >
            <Save className="w-4 h-4" />
            {isInjecting ? t('common.saving' as any) : t('map_engine.inject_button' as any)}
          </button>

          {/* Feedback */}
          {injectResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
              injectResult.success
                ? 'bg-green-950/40 text-green-400 border-green-800/40'
                : 'bg-red-950/40 text-red-400 border-red-800/40'
            }`}>
              {injectResult.success
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <XCircle className="w-4 h-4 flex-shrink-0" />
              }
              {injectResult.msg}
            </div>
          )}
        </div>

        {/* ════════════════════════════ COLUNA DIREITA (Live Preview) ════════════ */}
        <div className="w-1/2 flex flex-col gap-4 min-h-0">

          {/* Live Snippet */}
          <div className="bg-[#0f0f1a] border border-[#1e1e2e] rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-[#0b0b16] border-b border-[#1e1e2e]">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                {t('map_engine.spawn_live_preview_title' as any)}
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">{t('map_engine.spawn_live_preview_desc' as any)}</p>
              <pre className="font-mono text-xs bg-[#060609] border border-[#1a1a2e] rounded-lg p-4 text-emerald-400 whitespace-pre-wrap break-all leading-relaxed overflow-x-auto">
                {liveSnippet}
              </pre>
              {/* Legenda visual dos TABs */}
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="bg-cyan-900/40 text-cyan-500 px-1.5 py-0.5 rounded font-mono text-xs">\t</span>
                  = separador TAB
                </span>
                <span className="flex items-center gap-1">
                  <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono text-xs">,</span>
                  = separador de campo
                </span>
              </div>
            </div>
          </div>

          {/* Viewer do arquivo atual */}
          <div className="flex-1 bg-[#0f0f1a] border border-[#1e1e2e] rounded-xl overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 bg-[#0b0b16] border-b border-[#1e1e2e] flex-shrink-0">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                {t('map_engine.spawns_viewer_title' as any)}
              </span>
              <button
                onClick={fetchViewer}
                disabled={isLoadingViewer}
                className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                title="Recarregar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingViewer ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {viewerFilePath && (
              <div className="px-4 py-2 bg-[#060609] border-b border-[#1e1e2e] flex-shrink-0">
                <span className="text-xs text-gray-600 font-mono truncate block">{viewerFilePath}</span>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
              {viewerLines.length === 0 ? (
                <p className="text-xs text-gray-600 italic">{t('map_engine.spawns_viewer_empty' as any)}</p>
              ) : (
                <pre className="font-mono text-xs text-gray-400 whitespace-pre leading-5">
                  {viewerLines.join('\n')}
                </pre>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
