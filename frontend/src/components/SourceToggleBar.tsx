/**
 * SourceToggleBar.tsx — Reusable segmented control for toggling between
 * the official rAthena database and custom/import entries.
 *
 * @module SourceToggleBar
 */

import React from 'react';
import { Database, Sparkles } from 'lucide-react';
import { useLanguageStore } from '../store/useLanguageStore';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The two available source buckets for rAthena databases. */
export type SourceTab = 'rathena' | 'custom';

/** Accent colour theme applied to the active tab. */
export type SourceAccentColor = 'indigo' | 'violet' | 'emerald' | 'pink';

export interface SourceToggleBarProps {
  /** Currently active source tab. */
  value: SourceTab;
  /** Callback fired when the user switches tabs. */
  onChange: (tab: SourceTab) => void;
  /**
   * Optional entry count shown as a badge on the rAthena tab.
   * Omit to hide the badge entirely.
   */
  countRathena?: number;
  /**
   * Optional entry count shown as a badge on the Custom tab.
   * Omit to hide the badge entirely.
   */
  countCustom?: number;
  /**
   * Active-tab accent colour.
   * @default 'violet'
   */
  accentColor?: SourceAccentColor;
}

// ─── Accent colour maps ───────────────────────────────────────────────────────

const ACTIVE_CLASSES: Record<SourceAccentColor, { rathena: string; custom: string }> = {
  indigo: {
    rathena: 'bg-indigo-600/80 text-white shadow-md shadow-indigo-900/40',
    custom:  'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40',
  },
  violet: {
    rathena: 'bg-violet-600/80 text-white shadow-md shadow-violet-900/40',
    custom:  'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40',
  },
  emerald: {
    rathena: 'bg-violet-600/80 text-white shadow-md shadow-violet-900/40',
    custom:  'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40',
  },
  pink: {
    rathena: 'bg-pink-600/80 text-white shadow-md shadow-pink-900/40',
    custom:  'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40',
  },
};

const INACTIVE_CLASS = 'text-gray-500 hover:text-gray-300 hover:bg-white/5';

const BADGE_ACTIVE_CLASS = 'bg-white/15 text-white';
const BADGE_INACTIVE_CLASS = 'bg-dark-700 text-gray-500';

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Segmented control that toggles between rAthena (official) and Custom
 * (db/import) database entries.
 *
 * @example
 * ```tsx
 * <SourceToggleBar
 *   value={sourceTab}
 *   onChange={(tab) => { setSourceTab(tab); setSelectedId(null); }}
 *   countRathena={rathenaList.length}
 *   countCustom={customList.length}
 *   accentColor="indigo"
 * />
 * ```
 */
export const SourceToggleBar: React.FC<SourceToggleBarProps> = ({
  value,
  onChange,
  countRathena,
  countCustom,
  accentColor = 'violet',
}) => {
  const t = useLanguageStore((state) => state.t);
  const colors = ACTIVE_CLASSES[accentColor];

  return (
    <div className="flex gap-1 bg-dark-900/60 rounded-lg p-1 border border-white/5">
      {/* ── rAthena tab ── */}
      <button
        type="button"
        data-testid="btn-source-rathena"
        onClick={() => onChange('rathena')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
          value === 'rathena' ? colors.rathena : INACTIVE_CLASS
        }`}
      >
        <Database size={12} />
        <span>{t('source_toggle.rathena' as any) || 'rAthena'}</span>
        {countRathena !== undefined && (
          <span
            className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${
              value === 'rathena' ? BADGE_ACTIVE_CLASS : BADGE_INACTIVE_CLASS
            }`}
          >
            {countRathena.toLocaleString()}
          </span>
        )}
      </button>

      {/* ── Custom tab ── */}
      <button
        type="button"
        data-testid="btn-source-custom"
        onClick={() => onChange('custom')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
          value === 'custom' ? colors.custom : INACTIVE_CLASS
        }`}
      >
        <Sparkles size={12} />
        <span>{t('source_toggle.custom' as any) || 'Custom'}</span>
        {countCustom !== undefined && (
          <span
            className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded ${
              value === 'custom' ? BADGE_ACTIVE_CLASS : BADGE_INACTIVE_CLASS
            }`}
          >
            {countCustom.toLocaleString()}
          </span>
        )}
      </button>
    </div>
  );
};
