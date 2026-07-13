import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config/env';
import {
  Save, BookOpen, Eye, EyeOff, Hash, Upload, RefreshCw,
  ImageIcon, Monitor, Database, Trash2,
} from 'lucide-react';
import { GrfAssetPickerModal } from './GrfAssetPickerModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { useLanguageStore } from '../store/useLanguageStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetsStatus {
  icon_exists: boolean;
  collection_exists: boolean;
  drop_spr_exists: boolean;
  drop_act_exists: boolean;
}

const DEFAULT_ASSETS_STATUS: AssetsStatus = {
  icon_exists: false,
  collection_exists: false,
  drop_spr_exists: false,
  drop_act_exists: false,
};

interface ClientFields {
  exists_in_lua: boolean;
  identifiedDisplayName: string;
  identifiedResourceName: string;
  identifiedDescriptionName: string[];
  unIdentifiedDisplayName: string;
  unIdentifiedResourceName: string;
  unIdentifiedDescriptionName: string[];
  slotCount: number;
  ClassNum: number;
  costume: boolean;
}

const EMPTY_FIELDS: ClientFields = {
  exists_in_lua: false,
  identifiedDisplayName:      '',
  identifiedResourceName:     '',
  identifiedDescriptionName:  [],
  unIdentifiedDisplayName:    '',
  unIdentifiedResourceName:   '',
  unIdentifiedDescriptionName: [],
  slotCount: 0,
  ClassNum:  0,
  costume:   false,
};

interface Props {
  item: any;                     // server item from yaml_db
  onSave: (itemId: number, fields: Record<string, any>) => Promise<boolean>;
  isNew?: boolean;               // Draft Mode — roteando para POST
  onCreate?: (itemId: number, fields: Record<string, any>) => Promise<boolean>;
  onDelete?: (itemId: number) => Promise<boolean>;  // Chamado após DELETE com sucesso
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Label: React.FC<{ text: string; mono?: boolean }> = ({ text, mono }) => (
  <label className={`block text-[10px] mb-1 text-gray-500 uppercase tracking-wider ${mono ? 'font-mono' : ''}`}>
    {text}
  </label>
);

const TextInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}> = ({ value, onChange, placeholder, mono }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`w-full bg-[#0f0f14] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-700
      focus:outline-none focus:border-cyan-500/60 transition-colors ${mono ? 'font-mono' : ''}`}
  />
);

const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => (
  <input
    type="number"
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full bg-[#0f0f14] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200
      focus:outline-none focus:border-cyan-500/60 transition-colors font-mono"
  />
);

/** Multi-line description editor — one line per row in a textarea. */
const DescriptionEditor: React.FC<{
  lines: string[];
  onChange: (lines: string[]) => void;
}> = ({ lines, onChange }) => {
  const t = useLanguageStore(state => state.t);
  const text = lines.join('\n');
  return (
    <textarea
      value={text}
      onChange={(e) => onChange(e.target.value.split('\n'))}
      rows={4}
      spellCheck={false}
      placeholder={t('client_item_detail.description_placeholder')}
      className="w-full bg-[#0f0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-700
        font-mono focus:outline-none focus:border-cyan-500/60 transition-colors resize-y leading-relaxed"
    />
  );
};

/** Card that mimics the RO item tooltip. */
const ItemCard: React.FC<{ fields: ClientFields; iconSrc: string }> = ({ fields, iconSrc }) => {
  const desc = fields.identifiedDescriptionName.filter(Boolean);
  const slots = fields.slotCount > 0 ? `[${fields.slotCount}]` : '';

  return (
    <div className="rounded-xl border border-[#2a2a40] bg-[#13131f] p-4 shadow-xl min-w-[220px] max-w-[320px] font-sans select-none">
      <div className="flex items-start gap-3 mb-2">
        <div className="w-12 h-12 bg-[#0f0f14] border border-white/10 rounded-lg flex items-center justify-center shrink-0 p-1 shadow-inner">
          <img 
            src={iconSrc} 
            alt="" 
            className="max-w-full max-h-full" 
            onError={(e) => { 
              e.currentTarget.onerror = null;
              e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'></path><path d='M3.3 7l8.7 5 8.7-5'></path><path d='M12 22V12'></path></svg>`;
            }} 
          />
        </div>
        <div>
          <p className="text-yellow-300 font-bold text-sm leading-tight">
            {fields.identifiedDisplayName || '—'} {slots}
          </p>
          {fields.costume && (
            <span className="text-[10px] text-violet-400 font-mono">[Costume]</span>
          )}
        </div>
      </div>
      {desc.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-0.5">
          {desc.map((line, i) => (
            <p key={i} className="text-[11px] text-gray-300 leading-snug">{line || <br />}</p>
          ))}
        </div>
      )}
      <div className="border-t border-white/10 mt-2 pt-2 flex flex-col gap-0.5">
        {fields.ClassNum > 0 && (
          <p className="text-[10px] text-gray-500 font-mono">ClassNum: {fields.ClassNum}</p>
        )}
        <p className="text-[10px] text-gray-600 font-mono">res: {decodeLatin1ToEucKr(fields.identifiedResourceName) || '—'}</p>
      </div>
    </div>
  );
};

/** Upload button that sends a file to the given endpoint. */
const AssetUploadButton: React.FC<{
  label: string;
  endpoint: string;
  accept?: string;
  onUploaded: () => void;
}> = ({ label, endpoint, accept = ".bmp", onUploaded }) => {
  const t = useLanguageStore(state => state.t);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await axios.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploaded();
    } catch (err: any) {
      alert(t('client_item_detail.upload_error', { error: err?.response?.data?.detail ?? err.message }));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1a1a28] border border-white/10
          hover:border-cyan-500/40 hover:bg-cyan-900/10 text-gray-400 hover:text-cyan-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Upload size={12} />
        {uploading ? t('client_item_detail.sending') : label}
      </button>
    </>
  );
};

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; span2?: boolean }> =
  ({ icon, title, children, span2 }) => (
    <div className={`bg-[#13131f] rounded-2xl border border-white/5 p-5 shadow-lg ${span2 ? 'xl:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/5 text-white">
        <span className="text-cyan-400">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );

const decodeLatin1ToEucKr = (str: string): string => {
  if (!str) return '';
  try {
    const bytes = new Uint8Array(str.split('').map(c => c.charCodeAt(0)));
    return new TextDecoder('euc-kr').decode(bytes);
  } catch {
    return str;
  }
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientItemDetail: React.FC<Props> = ({ item, onSave, isNew = false, onCreate, onDelete }) => {
  const t = useLanguageStore(state => state.t);
  const [fields, setFields]       = useState<ClientFields>(EMPTY_FIELDS);
  const [original, setOriginal]   = useState<ClientFields>(EMPTY_FIELDS);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [draftItemId, setDraftItemId] = useState<number>(0);
  const [createMsg, setCreateMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  // Delete Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Bust the icon URL cache after an upload
  const [iconBust, setIconBust]   = useState(Date.now());
  const [assetsStatus, setAssetsStatus] = useState<AssetsStatus>(DEFAULT_ASSETS_STATUS);

  // ── GRF Asset Picker State ────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [pickerType, setPickerType]   = useState<'item_icon' | 'item_collection' | 'item_sprite'>('item_icon');
  const [pickerTitle, setPickerTitle] = useState('Escolher da GRF');

  const openPicker = (type: 'item_icon' | 'item_collection' | 'item_sprite', title: string) => {
    setPickerType(type);
    setPickerTitle(title);
    setPickerOpen(true);
  };

  const handlePickerSelect = (resourceName: string) => {
    set('identifiedResourceName', resourceName);
    if (!fields.unIdentifiedResourceName || fields.unIdentifiedResourceName === original.unIdentifiedResourceName) {
      set('unIdentifiedResourceName', resourceName);
    }
    setIconBust(Date.now());
  };

  // ── Fetch from backend when item changes ──────────────────────────────────
  const fetchClientData = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await axios.get(`${API_URL}/api/client_items/${item.Id}`);
      const data: ClientFields = {
        ...EMPTY_FIELDS,
        ...res.data,
        identifiedDescriptionName:  res.data.identifiedDescriptionName  ?? [],
        unIdentifiedDescriptionName: res.data.unIdentifiedDescriptionName ?? [],
      };
      setFields(data);
      setOriginal(data);
      setAssetsStatus(res.data.assets_status ?? DEFAULT_ASSETS_STATUS);
    } catch {
      setFields(EMPTY_FIELDS);
      setOriginal(EMPTY_FIELDS);
      setAssetsStatus(DEFAULT_ASSETS_STATUS);
    } finally {
      setIsFetching(false);
    }
  }, [item.Id]);

  useEffect(() => {
    // Em Draft Mode não há nada para buscar — formulário começa em branco
    if (isNew) {
      setFields(EMPTY_FIELDS);
      setOriginal(EMPTY_FIELDS);
      setCreateMsg(null);
      return;
    }
    fetchClientData();
  }, [fetchClientData, isNew]);

  // ── Field helpers ─────────────────────────────────────────────────────────
  const set = <K extends keyof ClientFields>(key: K, val: ClientFields[K]) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  const isModified = JSON.stringify(fields) !== JSON.stringify(original);

  // ── Save (PUT — edição) ───────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    const payload: Record<string, any> = { ...fields };
    delete payload.exists_in_lua;
    const ok = await onSave(item.Id, payload);
    if (ok) {
      setOriginal(fields);
      fetchClientData();
    }
    setIsSaving(false);
  };

  // ── Create (POST — Draft Mode) ────────────────────────────────────────────
  const handleCreate = async () => {
    if (!draftItemId || draftItemId <= 0) {
      setCreateMsg({ text: t('client_item_editor.draft_item_id_label' as any) + ' é obrigatório.', type: 'error' });
      return;
    }
    if (!onCreate) return;
    setIsSaving(true);
    setCreateMsg(null);
    try {
      const payload: Record<string, any> = { ...fields };
      delete payload.exists_in_lua;
      const ok = await onCreate(draftItemId, payload);
      if (ok) {
        setCreateMsg({ text: (t('client_item_editor.create_success' as any) || 'Item criado!').replace('#{id}', String(draftItemId)), type: 'success' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete (DELETE — confirmação via modal) ─────────────────────────────
  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(item.Id);
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const iconSrc = `${API_URL}/api/images/item/${item.Id}?_bust=${iconBust}`;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0f0f14] text-gray-200">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r ${isNew ? 'from-violet-600/10' : 'from-cyan-600/10'} to-transparent`}>
        <div className="flex items-center gap-4">
          {/* Icon preview — oculta em draft mode pois o ID ainda não existe */}
          {!isNew && (
            <div className="relative w-14 h-14 rounded-xl bg-[#1a1a28] border border-white/10 flex items-center justify-center shadow-lg p-2 group">
              <img
                src={iconSrc}
                alt="icon"
                className="max-h-full max-w-full drop-shadow-md"
                onError={(e) => { 
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'></path><path d='M3.3 7l8.7 5 8.7-5'></path><path d='M12 22V12'></path></svg>`;
                }}
              />
              <button
                onClick={() => setIconBust(Date.now())}
                title={t('client_item_detail.reload_icon')}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/60 rounded-xl transition-opacity"
              >
                <RefreshCw size={16} className="text-cyan-400" />
              </button>
            </div>
          )}

          <div>
            {isNew ? (
              <>
                <h2 className="text-lg font-bold text-violet-400 leading-tight">
                  {t('client_item_editor.draft_mode_title' as any) || 'Criando Novo Item'}
                </h2>
                {/* Campo de ID em Draft Mode */}
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {t('client_item_editor.draft_item_id_label' as any) || 'Item ID'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={draftItemId || ''}
                    onChange={(e) => setDraftItemId(parseInt(e.target.value) || 0)}
                    placeholder={t('client_item_editor.draft_item_id_placeholder' as any) || 'Ex: 20001'}
                    className="w-28 bg-[#0f0f14] border border-violet-500/30 rounded px-2 py-1 text-sm text-gray-200 font-mono focus:outline-none focus:border-violet-400 transition-colors"
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white leading-tight">
                  {fields.identifiedDisplayName || item.Name || t('client_item_detail.no_client_name')}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs font-mono text-gray-500">
                  <span className="bg-[#1a1a28] px-2 py-0.5 rounded border border-white/10">
                    ID: <span className="text-cyan-400">{item.Id}</span>
                  </span>
                  <span className="bg-[#1a1a28] px-2 py-0.5 rounded border border-white/10">
                    {item.AegisName}
                  </span>
                  {fields.exists_in_lua ? (
                    <span className="text-emerald-400 text-[10px]">{t('client_item_detail.status.in_lua')}</span>
                  ) : (
                    <span className="text-amber-500 text-[10px]">{t('client_item_detail.status.missing_in_lua')}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isFetching && (
            <span className="text-xs text-gray-600 font-mono animate-pulse">{t('common.loading')}…</span>
          )}
          {!isNew && isModified && !isFetching && (
            <span className="text-amber-400 text-xs font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 animate-pulse">
              ● {t('client_item_detail.unsaved_changes')}
            </span>
          )}
          {isNew ? (
            <button
              onClick={handleCreate}
              disabled={isSaving || !draftItemId}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg ${
                draftItemId > 0 && !isSaving
                  ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/40 cursor-pointer'
                  : 'bg-[#1a1a28] text-gray-600 border border-white/5 cursor-not-allowed'
              }`}
            >
              <Save size={15} />
              {isSaving ? t('common.saving') : (t('client_item_editor.create_btn' as any) || 'Criar no ItemInfo.lua')}
            </button>
          ) : (
            <>
              {/* Botão Excluir — só aparece quando o item já existe no LUA e há handler */}
              {onDelete && fields.exists_in_lua && (
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all"
                  title={t('client_item_delete.btn_label' as any) || 'Excluir do ItemInfo'}
                >
                  <Trash2 size={14} />
                  {t('client_item_delete.btn_label' as any) || 'Excluir'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!isModified || isSaving || isFetching}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg ${
                  isModified && !isFetching
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/40 cursor-pointer'
                    : 'bg-[#1a1a28] text-gray-600 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Save size={15} />
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Draft Mode: Feedback Message ────────────────────────────────── */}
      {isNew && createMsg && (
        <div className={`mx-6 mt-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
          createMsg.type === 'error'
            ? 'bg-red-500/10 border border-red-500/20 text-red-400'
            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
        }`}>
          <span>{createMsg.text}</span>
        </div>
      )}

      {/* ── Delete Confirm Modal ───────────────────────────────────────────── */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        entityLabel={`Item #${item.Id} — ${fields.identifiedDisplayName || item.Name || String(item.Id)}`}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      {/* ── Content Grid ─────────────────────────────────────────────────── */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Identified */}
        <Card icon={<Eye size={16} />} title={t('client_item_detail.sections.identified')}>
          <div className="space-y-3">
            <div>
              <Label text="identifiedDisplayName" mono />
              <TextInput
                value={fields.identifiedDisplayName}
                onChange={(v) => set('identifiedDisplayName', v)}
                placeholder="Identified Display Name"
              />
            </div>
            <div>
              <Label text="identifiedResourceName" mono />
              <TextInput
                value={fields.identifiedResourceName}
                onChange={(v) => set('identifiedResourceName', v)}
                placeholder="Resource filename without extension"
                mono
              />
              {fields.identifiedResourceName && (
                <p className="text-[10px] text-gray-500 mt-1 font-sans">
                  Korean Name / Nome Coreano: <span className="text-cyan-400 font-medium">{decodeLatin1ToEucKr(fields.identifiedResourceName)}</span>
                </p>
              )}
            </div>
            <div>
              <Label text="identifiedDescriptionName" mono />
              <DescriptionEditor
                lines={fields.identifiedDescriptionName}
                onChange={(v) => set('identifiedDescriptionName', v)}
              />
            </div>
          </div>
        </Card>

        {/* Unidentified */}
        <Card icon={<EyeOff size={16} />} title={t('client_item_detail.sections.unidentified')}>
          <div className="space-y-3">
            <div>
              <Label text="unidentifiedDisplayName" mono />
              <TextInput
                value={fields.unIdentifiedDisplayName}
                onChange={(v) => set('unIdentifiedDisplayName', v)}
                placeholder="Unidentified Display Name"
              />
            </div>
            <div>
              <Label text="unidentifiedResourceName" mono />
              <TextInput
                value={fields.unIdentifiedResourceName}
                onChange={(v) => set('unIdentifiedResourceName', v)}
                placeholder="Unidentified Resource filename"
                mono
              />
              {fields.unIdentifiedResourceName && (
                <p className="text-[10px] text-gray-500 mt-1 font-sans">
                  Korean Name / Nome Coreano: <span className="text-cyan-400 font-medium">{decodeLatin1ToEucKr(fields.unIdentifiedResourceName)}</span>
                </p>
              )}
            </div>
            <div>
              <Label text="unidentifiedDescriptionName" mono />
              <DescriptionEditor
                lines={fields.unIdentifiedDescriptionName}
                onChange={(v) => set('unIdentifiedDescriptionName', v)}
              />
            </div>
          </div>
        </Card>

        {/* Extra */}
        <Card icon={<Hash size={16} />} title={t('client_item_detail.sections.extra_fields')}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label text="slotCount" mono />
              <NumberInput value={fields.slotCount} onChange={(v) => set('slotCount', v)} />
            </div>
            <div>
              <Label text="ClassNum" mono />
              <NumberInput value={fields.ClassNum} onChange={(v) => set('ClassNum', v)} />
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <Label text="costume" mono />
              <button
                onClick={() => set('costume', !fields.costume)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  fields.costume
                    ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                    : 'bg-[#0f0f14] border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${fields.costume ? 'bg-violet-400' : 'bg-gray-700'}`} />
                {fields.costume ? 'True' : 'False'}
              </button>
            </div>
          </div>
        </Card>

        {/* Assets */}
        <Card icon={<ImageIcon size={16} />} title={t('client_item_detail.sections.grf_assets')}>
          <div className="space-y-4">

            {/* Icon */}
            <div>
              <Label text={t('client_item_detail.labels.inventory_icon')} />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#0f0f14] border border-white/10 rounded-lg flex items-center justify-center p-1 shrink-0">
                  <img
                    src={iconSrc}
                    alt="icon"
                    className="max-w-full max-h-full"
                    onError={(e) => { 
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'></path><path d='M3.3 7l8.7 5 8.7-5'></path><path d='M12 22V12'></path></svg>`;
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AssetUploadButton
                      label={t('client_item_detail.buttons.upload_icon')}
                      endpoint={`${API_URL}/api/client_items/${item.Id}/icon`}
                      onUploaded={() => { setIconBust(Date.now()); fetchClientData(); }}
                    />
                    <button
                      type="button"
                      onClick={() => openPicker('item_icon', t('client_item_detail.picker.select_icon'))}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30
                        hover:border-cyan-400 hover:bg-cyan-900/40 text-cyan-300 transition-all font-medium"
                    >
                      <Database size={12} />
                      {t('client_item_detail.buttons.select_grf')}
                    </button>
                  </div>
                  <p className="text-[10px] font-mono flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${assetsStatus.icon_exists ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-gray-500">data/texture/유저인터페이스/item/{decodeLatin1ToEucKr(fields.identifiedResourceName) || '?'}.bmp</span>
                    <span className={assetsStatus.icon_exists ? 'text-green-400' : 'text-red-400'}>
                      ({assetsStatus.icon_exists ? t('client_item_detail.status.exists') : t('client_item_detail.status.missing')})
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Collection sprite */}
            <div>
              <Label text={t('client_item_detail.labels.collection_illustration')} />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#0f0f14] border border-white/10 rounded-lg flex items-center justify-center p-1 shrink-0">
                  <Monitor size={20} className="text-gray-700" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AssetUploadButton
                      label={t('client_item_detail.buttons.upload_collection')}
                      endpoint={`${API_URL}/api/client_items/${item.Id}/collection`}
                      onUploaded={() => fetchClientData()}
                    />
                    <button
                      type="button"
                      onClick={() => openPicker('item_collection', t('client_item_detail.picker.select_collection'))}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30
                        hover:border-cyan-400 hover:bg-cyan-900/40 text-cyan-300 transition-all font-medium"
                    >
                      <Database size={12} />
                      {t('client_item_detail.buttons.select_grf')}
                    </button>
                  </div>
                  <p className="text-[10px] font-mono flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${assetsStatus.collection_exists ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-gray-500">data/texture/유저인터페이스/collection/{decodeLatin1ToEucKr(fields.identifiedResourceName) || '?'}.bmp</span>
                    <span className={assetsStatus.collection_exists ? 'text-green-400' : 'text-red-400'}>
                      ({assetsStatus.collection_exists ? t('client_item_detail.status.exists') : t('client_item_detail.status.missing')})
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Drop Sprite */}
            <div>
              <Label text={t('client_item_detail.labels.drop_sprite')} />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#0f0f14] border border-white/10 rounded-lg flex items-center justify-center p-1 shrink-0">
                  <Database size={20} className="text-gray-700" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AssetUploadButton
                      label={t('client_item_detail.buttons.upload_drop_spr')}
                      endpoint={`${API_URL}/api/client_items/${item.Id}/drop_spr`}
                      accept=".spr"
                      onUploaded={() => fetchClientData()}
                    />
                    <AssetUploadButton
                      label={t('client_item_detail.buttons.upload_drop_act')}
                      endpoint={`${API_URL}/api/client_items/${item.Id}/drop_act`}
                      accept=".act"
                      onUploaded={() => fetchClientData()}
                    />
                    <button
                      type="button"
                      onClick={() => openPicker('item_sprite', t('client_item_detail.picker.select_sprite'))}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30
                        hover:border-cyan-400 hover:bg-cyan-900/40 text-cyan-300 transition-all font-medium"
                    >
                      <Database size={12} />
                      {t('client_item_detail.buttons.select_grf')}
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${assetsStatus.drop_spr_exists ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-500">data/sprite/아이템/{fields.identifiedResourceName || '?'}.spr</span>
                      <span className={assetsStatus.drop_spr_exists ? 'text-green-400' : 'text-red-400'}>
                        ({assetsStatus.drop_spr_exists ? t('client_item_detail.status.exists') : t('client_item_detail.status.missing')})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${assetsStatus.drop_act_exists ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-500">data/sprite/아이템/{fields.identifiedResourceName || '?'}.act</span>
                      <span className={assetsStatus.drop_act_exists ? 'text-green-400' : 'text-red-400'}>
                        ({assetsStatus.drop_act_exists ? t('client_item_detail.status.exists') : t('client_item_detail.status.missing')})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Card>

        {/* Card Preview */}
        <Card icon={<BookOpen size={16} />} title={t('client_item_detail.sections.card_preview')} span2>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-3 font-medium">{t('client_item_detail.previews.identified')}</p>
              <ItemCard fields={fields} iconSrc={iconSrc} />
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-3 font-medium">{t('client_item_detail.previews.unidentified')}</p>
              <ItemCard
                fields={{
                  ...fields,
                  identifiedDisplayName:     fields.unIdentifiedDisplayName,
                  identifiedResourceName:    fields.unIdentifiedResourceName,
                  identifiedDescriptionName: fields.unIdentifiedDescriptionName,
                }}
                iconSrc={iconSrc}
              />
            </div>
          </div>
        </Card>

      </div>

      {/* ── GRF Asset Picker Modal ─────────────────────────────────────────── */}
      <GrfAssetPickerModal
        isOpen={pickerOpen}
        assetType={pickerType}
        title={pickerTitle}
        currentResourceName={fields.identifiedResourceName}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
      />
    </div>
  );
};

export default ClientItemDetail;
