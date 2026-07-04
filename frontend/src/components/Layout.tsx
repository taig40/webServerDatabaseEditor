import React from 'react';
import { Database, Package, FileCode2, Settings } from 'lucide-react';

const Layout: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <div className="flex h-screen w-full bg-dark-900 text-gray-300 font-sans overflow-hidden">
      {/* Sidebar de Ícones */}
      <div className="w-16 flex flex-col items-center py-4 bg-dark-800 border-r border-dark-600 gap-6">
        <div className="text-primary cursor-pointer hover:text-white transition-colors" title="Bancos de Dados">
          <Database size={28} />
        </div>
        <div className="text-gray-500 cursor-pointer hover:text-white transition-colors" title="Itens">
          <Package size={28} />
        </div>
        <div className="text-gray-500 cursor-pointer hover:text-white transition-colors" title="Scripts">
          <FileCode2 size={28} />
        </div>
        <div className="mt-auto text-gray-500 cursor-pointer hover:text-white transition-colors">
          <Settings size={28} />
        </div>
      </div>
      
      {/* Secondary Sidebar (Explorer) */}
      <div className="hidden w-64 bg-dark-800 border-r border-dark-600 flex-col shadow-lg z-10">
        <div className="p-3 text-xs font-bold uppercase tracking-wider text-gray-400">
          Explorer
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-1 cursor-pointer bg-dark-700 text-white border-l-2 border-primary text-sm flex items-center gap-2">
             <Package size={14} className="text-primary"/>
             item_db.yml
          </div>
          <div className="px-3 py-1 cursor-pointer hover:bg-dark-700 text-gray-400 text-sm flex items-center gap-2">
             <Database size={14} />
             mob_db.yml
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-dark-900 overflow-hidden">
        {/* Abas Superiores */}
        <div className="flex h-9 bg-dark-800 border-b border-dark-600">
          <div className="px-4 py-2 bg-dark-900 text-white text-sm border-t-2 border-primary flex items-center gap-2 shadow-sm">
            <Package size={14} className="text-primary"/>
            item_db.yml
          </div>
        </div>
        
        {/* Content Wrapper */}
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
