import React, { useState } from 'react';
import { useLanguageStore } from '../store/useLanguageStore';
import {
  Package,
  Skull,
  Scroll,
  Trophy,
  Sword,
  ListChecks,
  Layers,
  Users,
  BookOpen,
  Star,
  Zap,
  FlaskConical,
  ChevronRight,
  ChevronLeft,
  Database,
  Settings,
  ShieldCheck,
  Sparkles,
  Scale,
  Shield,
  TrendingUp,
  Network,
  Map,
} from 'lucide-react';

// ─── Module definitions ─────────────────────────────────────────────────────

export type ModuleId =
  | 'items'
  | 'mobs'
  | 'client_items'
  | 'skills'
  | 'server_quests'
  | 'item_combos'
  | 'server_achievements'
  | 'pets'
  | 'constants'
  | 'random_options'
  | 'size_fix'
  | 'job_database'
  | 'exp_tables'
  | 'skill_tree'
  | 'map_engine'
  | 'custom_spawns';

interface Module {
  id: ModuleId;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  group: 'server' | 'client' | 'misc';
  available: boolean;
}

const MODULES: Module[] = [
  // ── Server DB ──
  { id: 'items',               label: 'Itens',                sublabel: 'item_db.yml',         icon: Package,      group: 'server', available: true  },
  { id: 'mobs',                label: 'Monstros',             sublabel: 'mob_db.yml',           icon: Skull,        group: 'server', available: true  },
  { id: 'skills',              label: 'Habilidades',          sublabel: 'skill_db.yml',         icon: Zap,          group: 'server', available: true  },
  { id: 'job_database',        label: 'Classes & Atributos',  sublabel: 'job_stats.yml',       icon: Shield,       group: 'server', available: true  },
  { id: 'exp_tables',          label: 'Tabelas de Experiência', sublabel: 'job_exp.yml',       icon: TrendingUp,   group: 'server', available: true  },
  { id: 'skill_tree',          label: 'Árvore de Habilidades', sublabel: 'skill_tree.yml',      icon: Network,      group: 'server', available: true  },
  { id: 'server_quests',       label: 'Quests',               sublabel: 'quest_db.yml',         icon: Scroll,       group: 'server', available: true  },
  { id: 'item_combos',         label: 'Combos de Itens',      sublabel: 'item_combos.yml',      icon: Layers,       group: 'server', available: true  },
  { id: 'custom_spawns',       label: 'Custom Spawns',        sublabel: 'ui_spawns.txt',        icon: Map,          group: 'server', available: true  },
  { id: 'server_achievements', label: 'Conquistas',           sublabel: 'achievement_db.yml',   icon: Trophy,       group: 'server', available: true  },
  { id: 'pets',                label: 'Mascotes',             sublabel: 'pet_db.yml',           icon: Star,         group: 'server', available: true  },
  { id: 'random_options',      label: 'Opções Aleatórias',    sublabel: 'item_randomopt_group.yml', icon: Sparkles,  group: 'server', available: true  },
  { id: 'map_engine',          label: 'Map Engine',           sublabel: 'map_drops.yml',            icon: Map,       group: 'server', available: true  },
  { id: 'size_fix',            label: 'Penalidades de Tamanho', sublabel: 'size_fix.yml',        icon: Scale,     group: 'server', available: true  },
  // ── Client DB ──
  { id: 'client_items',        label: 'Itens (Cliente)',      sublabel: 'iteminfo.lua',         icon: BookOpen,     group: 'client', available: true  },
  // ── Misc ──
  { id: 'constants',           label: 'Constantes',          sublabel: 'const.yml',            icon: FlaskConical, group: 'misc',   available: true },
];

const GROUP_LABELS: Record<string, string> = {
  server: 'Servidor',
  client: 'Cliente',
  misc:   'Outros',
};

// ─── Layout Props ────────────────────────────────────────────────────────────

interface LayoutProps {
  children: React.ReactNode;
  activeView: ModuleId | 'settings';
  onViewChange: (view: ModuleId) => void;
  onSettingsClick: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, onSettingsClick }) => {
  const t = useLanguageStore(state => state.t);
  const [expanded, setExpanded] = useState(true);

  const activeModule = MODULES.find(m => m.id === activeView) || null;
  const ActiveIcon = activeModule?.icon ?? Settings;

  const groupedModules = ['server', 'client', 'misc'].map(group => ({
    group,
    modules: MODULES.filter(m => m.group === group),
  }));

  return (
    <div className="flex h-screen w-full bg-[#0f0f14] text-gray-300 font-sans overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className="flex flex-col bg-[#12121a] border-r border-[#1e1e2e] transition-all duration-300 ease-in-out z-20 shadow-xl"
        style={{ width: expanded ? '240px' : '60px', minWidth: expanded ? '240px' : '60px' }}
      >
        {/* Logo / Header */}
        <div className="flex items-center h-14 border-b border-[#1e1e2e] px-3 gap-3 overflow-hidden">
          {expanded ? (
            <>
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Database size={16} className="text-white" />
              </div>
              <div className="flex flex-col leading-tight overflow-hidden">
                <span className="text-sm font-bold text-white truncate">rAthena</span>
                <span className="text-[10px] text-violet-400 truncate">Database Editor</span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="ml-auto flex-shrink-0 text-gray-500 hover:text-white transition-colors p-1 rounded"
                title={t('layout.collapse')}
              >
                <ChevronLeft size={16} />
              </button>
            </>
          ) : (
            <div className="w-full flex justify-center">
              <button
                onClick={() => setExpanded(true)}
                className="text-gray-500 hover:text-white transition-colors p-2 rounded flex items-center justify-center"
                title={t('layout.expand')}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-5">
          {groupedModules.map(({ group, modules }) => (
            <div key={group}>
              {/* Group Label */}
              {expanded && (
                <div className="px-4 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                    {t(`layout.groups.${group}` as any)}
                  </span>
                </div>
              )}
              {!expanded && (
                <div className="h-px bg-[#1e1e2e] mx-3 mb-2" />
              )}

              {/* Module Items */}
              <ul className="space-y-0.5 px-2">
                {modules.map(mod => {
                  const Icon = mod.icon;
                  const isActive = activeView === mod.id;
                  const isDisabled = !mod.available;

                  return (
                    <li key={mod.id}>
                      <button
                        onClick={() => mod.available && onViewChange(mod.id)}
                        disabled={isDisabled}
                        title={!expanded ? t(`layout.modules.${mod.id}` as any) : undefined}
                        className={[
                          'w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-all duration-150',
                          isActive
                            ? 'bg-gradient-to-r from-violet-600/30 to-indigo-600/10 text-white border border-violet-500/30'
                            : isDisabled
                            ? 'text-gray-700 cursor-not-allowed'
                            : 'text-gray-400 hover:bg-[#1a1a28] hover:text-gray-200',
                        ].join(' ')}
                      >
                        {/* Icon */}
                        <span className={[
                          'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors',
                          isActive ? 'bg-violet-500/20 text-violet-400' : isDisabled ? 'text-gray-700' : 'text-gray-500 group-hover:text-gray-300',
                        ].join(' ')}>
                          <Icon size={15} />
                        </span>

                        {/* Label */}
                        {expanded && (
                          <div className="flex flex-col min-w-0">
                            <span className={`text-[13px] font-medium truncate ${isActive ? 'text-white' : ''}`}>
                              {t(`layout.modules.${mod.id}` as any)}
                            </span>
                            <span className={`text-[10px] truncate font-mono ${isActive ? 'text-violet-300' : 'text-gray-600'}`}>
                              {mod.sublabel}
                            </span>
                          </div>
                        )}

                        {/* Active indicator */}
                        {isActive && expanded && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                        )}

                        {/* "em breve" badge */}
                        {isDisabled && expanded && (
                          <span className="ml-auto text-[9px] uppercase tracking-wider text-gray-700 flex-shrink-0">
                            {t('layout.coming_soon')}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-[#1e1e2e] p-2">
          <button
            onClick={onSettingsClick}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
              activeView === 'settings'
                ? 'bg-gradient-to-r from-violet-600/30 to-indigo-600/10 text-white border border-violet-500/30'
                : 'text-gray-600 hover:text-gray-400 hover:bg-[#1a1a28]'
            }`}
          >
            <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
              <Settings size={15} className={activeView === 'settings' ? 'text-violet-400' : ''} />
            </span>
            {expanded && <span className="text-[13px] font-medium">{t('layout.settings')}</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[#0f0f14] overflow-hidden">

        {/* Top Tab Bar */}
        <div className="flex h-9 bg-[#12121a] border-b border-[#1e1e2e] items-end px-0">
          <div className="flex items-center gap-2 px-4 h-9 bg-[#0f0f14] text-white text-[13px] border-t-2 border-violet-500 -mb-px shadow-sm">
            <ActiveIcon size={13} className="text-violet-400 flex-shrink-0" />
            <span className="font-medium">{activeView === 'settings' ? t('layout.settings') : activeModule && t(`layout.modules.${activeModule.id}` as any)}</span>
            {activeModule && <span className="text-[11px] text-gray-500 font-mono">{activeModule.sublabel}</span>}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
