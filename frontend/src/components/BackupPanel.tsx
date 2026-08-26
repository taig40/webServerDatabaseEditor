import React, { useState } from 'react';
import axios from 'axios';
import {
  Archive,
  FolderOpen,
  RotateCcw,
  Loader2,
  AlertCircle,
  FileArchive,
  Server,
  Monitor,
  DatabaseZap,
} from 'lucide-react';

import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';
import { toast } from '../store/useToastStore';

type BackupScope = 'server' | 'client' | 'full';

const API_BASE = API_URL || 'http://127.0.0.1:8000';

// ─── Sub-component: Confirmation Modal ────────────────────────────────────────

interface ConfirmRestoreModalProps {
  zipFilename: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmRestoreModal: React.FC<ConfirmRestoreModalProps> = ({
  zipFilename,
  onConfirm,
  onCancel,
}) => {
  const t = useLanguageStore(state => state.t);
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f0f16] border border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={22} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-base">{t('backup.confirm_restore_title')}</h2>
            <p className="text-gray-500 text-xs mt-0.5 font-mono truncate">{zipFilename}</p>
          </div>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{t('backup.confirm_restore_body')}</p>
        <div className="flex gap-3 mt-2">
          <button
            id="backup-restore-cancel-btn"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 bg-dark-800/60 text-gray-400 hover:text-white text-sm font-semibold transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            id="backup-restore-confirm-btn"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors shadow-lg shadow-amber-900/30"
          >
            {t('backup.confirm_restore_action')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ScopeOption {
  value: BackupScope;
  icon: React.ReactNode;
  labelKey: any;
  descKey: any;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { value: 'server', icon: <Server size={16} />, labelKey: 'backup.scope_server', descKey: 'backup.scope_server_desc' },
  { value: 'client', icon: <Monitor size={16} />, labelKey: 'backup.scope_client', descKey: 'backup.scope_client_desc' },
  { value: 'full',   icon: <DatabaseZap size={16} />, labelKey: 'backup.scope_full', descKey: 'backup.scope_full_desc' },
];


const BackupPanel: React.FC = () => {
  const t = useLanguageStore(state => state.t);

  const [scope, setScope] = useState<BackupScope>('server');
  const [destDir, setDestDir] = useState('');
  const [zipPath, setZipPath] = useState('');

  const [isBrowsingDest, setIsBrowsingDest] = useState(false);
  const [isBrowsingZip, setIsBrowsingZip] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [pendingRestore, setPendingRestore] = useState(false);

  // ── Browse helpers ──────────────────────────────────────────────────────────

  const handleBrowseDest = async () => {
    setIsBrowsingDest(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/backup/browse-dest`, {
        initial: destDir || '',
      });
      if (data.path) setDestDir(data.path);
    } catch {
      toast.error(t('backup.error_browse'));
    } finally {
      setIsBrowsingDest(false);
    }
  };

  const handleBrowseZip = async () => {
    setIsBrowsingZip(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/backup/browse-zip`, {
        initial: destDir || '',
      });
      if (data.path) setZipPath(data.path);
    } catch {
      toast.error(t('backup.error_browse'));
    } finally {
      setIsBrowsingZip(false);
    }
  };

  // ── Create Backup ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!destDir) {
      toast.error(t('backup.no_dest'));
      return;
    }
    setIsCreating(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/backup/create`, {
        scope,
        dest_dir: destDir,
      });
      toast.success(t('backup.success_create', { filename: data.filename }));
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t('backup.error_create');
      toast.error(detail);
    } finally {
      setIsCreating(false);
    }
  };

  // ── Restore Backup ──────────────────────────────────────────────────────────

  const handleRestoreRequest = () => {
    if (!zipPath) {
      toast.error(t('backup.no_zip'));
      return;
    }
    setPendingRestore(true);
  };

  const handleRestoreConfirm = async () => {
    setPendingRestore(false);
    setIsRestoring(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/backup/restore`, {
        zip_path: zipPath,
        scope,
      });
      toast.success(t('backup.success_restore', { count: String(data.restored_count) }));
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t('backup.error_restore');
      toast.error(detail);
    } finally {
      setIsRestoring(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const inputClass = 'flex-1 min-w-0 bg-dark-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none transition-colors font-mono';
  const iconBtnClass = 'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-white/10 bg-dark-800/60 text-gray-300 hover:text-white hover:border-white/20 transition-all';

  return (
    <>
      {pendingRestore && (
        <ConfirmRestoreModal
          zipFilename={zipPath.split('/').pop() || zipPath}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setPendingRestore(false)}
        />
      )}

      <div
        id="backup-panel"
        className="rounded-2xl border border-white/5 bg-dark-800/30 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-violet-600/8 to-transparent flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
            <Archive size={16} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">{t('backup.title')}</h2>
            <p className="text-gray-500 text-xs">{t('backup.subtitle')}</p>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-6">

          {/* Scope Selector */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">
              {t('backup.scope_label')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {SCOPE_OPTIONS.map(({ value, icon, labelKey, descKey }) => {
                const isActive = scope === value;
                return (
                  <button
                    key={value}
                    id={`backup-scope-${value}`}
                    type="button"
                    onClick={() => setScope(value)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all
                      ${isActive
                        ? 'border-violet-500/60 bg-violet-600/10 text-violet-300'
                        : 'border-white/8 bg-dark-900/40 text-gray-400 hover:border-white/15 hover:text-gray-200'
                      }`}
                  >
                    <span className={isActive ? 'text-violet-400' : 'text-gray-500'}>{icon}</span>
                    <span className="text-xs font-bold uppercase tracking-wide">{t(labelKey)}</span>
                    <span className="text-[10px] text-gray-600 leading-tight">{t(descKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destination Folder */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">
              {t('backup.dest_label')}
            </label>
            <div className="flex gap-2">
              <input
                id="backup-dest-input"
                type="text"
                readOnly
                value={destDir}
                placeholder={t('backup.dest_placeholder')}
                className={inputClass}
              />
              <button
                id="backup-browse-dest-btn"
                type="button"
                onClick={handleBrowseDest}
                disabled={isBrowsingDest}
                className={iconBtnClass}
              >
                {isBrowsingDest
                  ? <Loader2 size={14} className="animate-spin" />
                  : <FolderOpen size={14} />
                }
                <span>{t('backup.browse_folder')}</span>
              </button>
            </div>
          </div>

          {/* Create Backup Button */}
          <button
            id="backup-create-btn"
            type="button"
            onClick={handleCreate}
            disabled={isCreating || isRestoring}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-all shadow-lg shadow-violet-900/20 disabled:opacity-50"
          >
            {isCreating
              ? <><Loader2 size={15} className="animate-spin" /><span>{t('backup.creating')}</span></>
              : <><FileArchive size={15} /><span>{t('backup.create_btn')}</span></>
            }
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[11px] text-gray-600 uppercase tracking-wider font-semibold">
              {t('backup.restore_divider')}
            </span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* ZIP Picker + Restore */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">
              {t('backup.zip_label')}
            </label>
            <div className="flex gap-2 mb-3">
              <input
                id="backup-zip-input"
                type="text"
                readOnly
                value={zipPath}
                placeholder={t('backup.zip_placeholder')}
                className={inputClass}
              />
              <button
                id="backup-browse-zip-btn"
                type="button"
                onClick={handleBrowseZip}
                disabled={isBrowsingZip}
                className={iconBtnClass}
              >
                {isBrowsingZip
                  ? <Loader2 size={14} className="animate-spin" />
                  : <FolderOpen size={14} />
                }
                <span>{t('backup.browse_zip')}</span>
              </button>
            </div>

            <button
              id="backup-restore-btn"
              type="button"
              onClick={handleRestoreRequest}
              disabled={isRestoring || isCreating || !zipPath}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-amber-500/40 bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 font-bold text-sm transition-all disabled:opacity-40"
            >
              {isRestoring
                ? <><Loader2 size={15} className="animate-spin" /><span>{t('backup.restoring')}</span></>
                : <><RotateCcw size={15} /><span>{t('backup.restore_btn')}</span></>
              }
            </button>
          </div>

        </div>
      </div>
    </>
  );
};

export default BackupPanel;
