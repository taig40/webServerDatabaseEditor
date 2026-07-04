import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { AgGridReact } from 'ag-grid-react';
import { API_URL } from '../config/env';
import { ColDef, CellValueChangedEvent, SelectionChangedEvent } from 'ag-grid-community';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

import MonsterAnimator from '../components/MonsterAnimator';
import { Shield, Heart, Sword, ShieldAlert, Award, Star, Database, Sparkles } from 'lucide-react';

type SourceTab = 'rathena' | 'custom';

const MonsterEditor: React.FC = () => {
  const [mobs, setMobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Conectando ao Backend...");
  const [mobsLoaded, setMobsLoaded] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [selectedMob, setSelectedMob] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'drops' | 'ai'>('info');
  const [sourceTab, setSourceTab] = useState<SourceTab>('rathena');

  // Polling loading status
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkStatusAndFetch = async () => {
      try {
        const statusRes = await axios.get(`${API_URL}/api/mobs/status`);
        const { is_loading, message, mobs_loaded } = statusRes.data;

        setLoadingStatus(message);
        setMobsLoaded(mobs_loaded);

        if (!is_loading && message !== "Aguardando inicialização...") {
          if (intervalId) clearInterval(intervalId);
          setLoadingStatus("Carregando grade de monstros...");
          try {
            const mobsRes = await axios.get(`${API_URL}/api/mobs/?skip=0&limit=50000`);
            setMobs(mobsRes.data.mobs);
            setIsLoading(false);
          } catch (err) {
            console.error("Erro ao baixar monstros:", err);
            setLoadingStatus("Erro ao receber os monstros.");
          }
        }
      } catch (err) {
        console.error("Erro no polling de status de monstros:", err);
        setLoadingStatus("Servidor offline. Reconectando...");
      }
    };

    checkStatusAndFetch();
    intervalId = setInterval(checkStatusAndFetch, 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Columns definition for ag-Grid
  const [columnDefs] = useState<ColDef[]>([
    { field: 'Id', headerName: 'ID', width: 85, editable: false, pinned: 'left' },
    { field: 'AegisName', headerName: 'AegisName', width: 140, editable: true },
    { field: 'Name', headerName: 'Nome Inglês', width: 150, editable: true },
    { field: 'Level', headerName: 'Lvl', width: 70, editable: true, type: 'numericColumn' },
    { field: 'Hp', headerName: 'HP', width: 100, editable: true, type: 'numericColumn' },
    { field: 'Attack', headerName: 'ATK1', width: 80, editable: true, type: 'numericColumn' },
    { field: 'Attack2', headerName: 'ATK2', width: 80, editable: true, type: 'numericColumn' },
    { field: 'Defense', headerName: 'DEF', width: 80, editable: true, type: 'numericColumn' },
    { field: 'MagicDefense', headerName: 'MDEF', width: 80, editable: true, type: 'numericColumn' },
    { field: 'Size', headerName: 'Tamanho', width: 100, editable: true, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['Small', 'Medium', 'Large'] } },
    { field: 'Race', headerName: 'Raça', width: 110, editable: true, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['Formless', 'Undead', 'Brute', 'Plant', 'Insect', 'Fish', 'Demon', 'Demihuman', 'Angel', 'Dragon'] } },
    { field: 'Element', headerName: 'Elemento', width: 110, editable: true },
  ]);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      sortable: true,
      filter: true,
      resizable: true,
    };
  }, []);

  // Handler for grid cell value updates
  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    if (event.oldValue === event.newValue) return;

    const mobId = event.data.Id;
    const fieldName = event.colDef.field!;

    try {
      await axios.put(`${API_URL}/api/mobs/${mobId}`, {
        [fieldName]: event.newValue
      });
      console.log(`[webSDE] Mob ${mobId} atualizado com sucesso!`);
      // Update selected mob view state if currently selected
      if (selectedMob && selectedMob.Id === mobId) {
        setSelectedMob((prev: any) => ({ ...prev, [fieldName]: event.newValue }));
      }
    } catch (err) {
      console.error("[webSDE] Erro ao salvar mob:", err);
      event.node.setDataValue(event.column, event.oldValue);
      alert("Erro de conexão ao salvar alteração do monstro.");
    }
  }, [selectedMob]);

  // Handler for row selection
  const onSelectionChanged = useCallback((event: SelectionChangedEvent) => {
    const selectedRows = event.api.getSelectedRows();
    if (selectedRows.length > 0) {
      setSelectedMob(selectedRows[0]);
    } else {
      setSelectedMob(null);
    }
  }, []);

  // Handler for quick editing fields in detail panel
  const handleDetailFieldChange = async (fieldName: string, value: any) => {
    if (!selectedMob) return;
    const mobId = selectedMob.Id;

    try {
      const updatedValue = value === "" ? null : value;
      await axios.put(`${API_URL}/api/mobs/${mobId}`, {
        [fieldName]: updatedValue
      });
      
      setSelectedMob((prev: any) => ({ ...prev, [fieldName]: updatedValue }));
      
      // Update grid rowData
      setMobs(prevMobs => prevMobs.map(m => m.Id === mobId ? { ...m, [fieldName]: updatedValue } : m));
    } catch (err) {
      console.error("[webSDE] Erro ao atualizar campo no painel:", err);
      alert("Falha ao atualizar o monstro.");
    }
  };
  // Separate mobs by source and sort by Id
  const rathenaMobs = useMemo(() =>
    [...mobs.filter(m => m._source !== 'custom')].sort((a, b) => a.Id - b.Id),
    [mobs]
  );
  const customMobs = useMemo(() =>
    [...mobs.filter(m => m._source === 'custom')].sort((a, b) => a.Id - b.Id),
    [mobs]
  );

  const activeMobs = sourceTab === 'rathena' ? rathenaMobs : customMobs;

  return (
    <div className="h-full flex flex-col bg-dark-900 text-gray-200">
      {/* Top Header Bar */}
      <div className="p-4 flex flex-col gap-3 bg-dark-900 border-b border-dark-600">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl text-white font-semibold flex items-center gap-2">
              <ShieldAlert size={22} className="text-primary" />
              Monster Database Editor
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Selecione uma linha para visualizar a animação. Clique duas vezes em uma célula para edição inline.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="text"
              placeholder="Filtrar monstros..."
              className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded text-sm text-gray-200 focus:outline-none focus:border-primary w-64"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <div className="text-sm bg-dark-800 px-3 py-1.5 rounded border border-dark-600 shadow text-gray-300">
              {isLoading ? 'Lendo YAMLs...' : `${activeMobs.length.toLocaleString()} Monstros`}
            </div>
          </div>
        </div>

        {/* Source Tabs */}
        <div className="flex gap-1 bg-dark-800/60 rounded-lg p-1 border border-white/5 self-start min-w-[280px]">
          <button
            onClick={() => { setSourceTab('rathena'); setSelectedMob(null); }}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all duration-200 ${
              sourceTab === 'rathena'
                ? 'bg-violet-600/80 text-white shadow-md shadow-violet-900/40'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <Database size={12} />
            rAthena
            <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.5 rounded ${
              sourceTab === 'rathena' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'
            }`}>
              {rathenaMobs.length.toLocaleString()}
            </span>
          </button>
          <button
            onClick={() => { setSourceTab('custom'); setSelectedMob(null); }}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all duration-200 ${
              sourceTab === 'custom'
                ? 'bg-emerald-600/80 text-white shadow-md shadow-emerald-900/40'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <Sparkles size={12} />
            Custom
            <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.5 rounded ${
              sourceTab === 'custom' ? 'bg-white/15 text-white' : 'bg-dark-700 text-gray-500'
            }`}>
              {customMobs.length.toLocaleString()}
            </span>
          </button>
        </div>
      </div>

      {/* Main Workspace Split Layout */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
            <h3 className="text-2xl text-white font-semibold mb-2">Carregando Banco de Monstros</h3>
            <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
            <div className="bg-dark-800 px-4 py-2 rounded-full border border-dark-600">
              <span className="text-primary font-bold text-lg">{mobsLoaded.toLocaleString()}</span>
              <span className="text-gray-500 ml-2">mobs carregados</span>
            </div>
          </div>
        )}

        {/* Left Side: AgGrid */}
        <div className="flex-1 p-2 bg-dark-900 border-r border-dark-600 overflow-hidden">
          <div
            className="ag-theme-alpine-dark w-full h-full rounded shadow-xl"
            style={{
              '--ag-background-color': '#1e1e1e',
              '--ag-header-background-color': '#252526',
              '--ag-odd-row-background-color': '#1e1e1e',
              '--ag-row-hover-color': '#2a2d2e',
              '--ag-border-color': '#3e3e42',
              '--ag-header-foreground-color': '#cccccc',
              '--ag-data-color': '#d4d4d4',
              '--ag-font-family': 'Inter, sans-serif'
            } as React.CSSProperties}
          >
            <AgGridReact
              rowData={activeMobs}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onCellValueChanged={onCellValueChanged}
              onSelectionChanged={onSelectionChanged}
              rowSelection="single"
              animateRows={true}
              quickFilterText={searchText}
            />
          </div>
        </div>

        {/* Right Side: Preview & Detailed Editor */}
        <div className="w-96 flex flex-col bg-dark-800/80 border-l border-dark-600 overflow-y-auto">
          {selectedMob ? (
            <div className="flex flex-col p-4 gap-4">
              {/* Monster Title */}
              <div className="flex items-start justify-between border-b border-dark-600 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    {selectedMob.Name}
                  </h3>
                  <span className="text-[10px] text-gray-500 font-mono">
                    ID: {selectedMob.Id} | AEGIS: {selectedMob.AegisName}
                  </span>
                </div>
                {selectedMob.Class === 'Boss' && (
                  <span className="text-[10px] bg-red-950/80 border border-red-800 text-red-400 px-2 py-0.5 rounded-full font-bold">
                    MVP
                  </span>
                )}
              </div>

              {/* Monster Animation Frame */}
              <div className="flex justify-center py-2">
                <MonsterAnimator 
                  mobId={selectedMob.Id} 
                  mobName={selectedMob.Name} 
                  size="md" 
                />
              </div>

              {/* Tabs Menu */}
              <div className="flex border-b border-dark-600 gap-1 text-xs">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`flex-1 py-1.5 text-center font-semibold rounded-t transition-all ${
                    activeTab === 'info' 
                      ? 'bg-dark-900 border-t-2 border-primary text-white' 
                      : 'hover:bg-dark-700 text-gray-400'
                  }`}
                >
                  Status
                </button>
                <button
                  onClick={() => setActiveTab('drops')}
                  className={`flex-1 py-1.5 text-center font-semibold rounded-t transition-all ${
                    activeTab === 'drops' 
                      ? 'bg-dark-900 border-t-2 border-primary text-white' 
                      : 'hover:bg-dark-700 text-gray-400'
                  }`}
                >
                  Drops
                </button>
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`flex-1 py-1.5 text-center font-semibold rounded-t transition-all ${
                    activeTab === 'ai' 
                      ? 'bg-dark-900 border-t-2 border-primary text-white' 
                      : 'hover:bg-dark-700 text-gray-400'
                  }`}
                >
                  IA Modos
                </button>
              </div>

              {/* Tab 1: Base Status */}
              {activeTab === 'info' && (
                <div className="flex flex-col gap-3 text-sm">
                  {/* Grid Status */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Level */}
                    <div className="bg-dark-900/60 p-2 rounded border border-dark-600 flex items-center gap-2">
                      <Star size={16} className="text-yellow-500" />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500">LEVEL</span>
                        <input
                          type="number"
                          className="bg-transparent text-white font-bold w-full focus:outline-none focus:border-b border-primary text-sm"
                          value={selectedMob.Level || 1}
                          onChange={(e) => handleDetailFieldChange('Level', parseInt(e.target.value))}
                        />
                      </div>
                    </div>

                    {/* HP */}
                    <div className="bg-dark-900/60 p-2 rounded border border-dark-600 flex items-center gap-2">
                      <Heart size={16} className="text-red-500" />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500">VITALIDADE (HP)</span>
                        <input
                          type="number"
                          className="bg-transparent text-white font-bold w-full focus:outline-none focus:border-b border-primary text-sm"
                          value={selectedMob.Hp || 0}
                          onChange={(e) => handleDetailFieldChange('Hp', parseInt(e.target.value))}
                        />
                      </div>
                    </div>

                    {/* ATK Min/Max */}
                    <div className="bg-dark-900/60 p-2 rounded border border-dark-600 flex items-center gap-2">
                      <Sword size={16} className="text-orange-500" />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500">ATAQUE MÍN</span>
                        <input
                          type="number"
                          className="bg-transparent text-white font-bold w-full focus:outline-none focus:border-b border-primary text-sm"
                          value={selectedMob.Attack || 0}
                          onChange={(e) => handleDetailFieldChange('Attack', parseInt(e.target.value))}
                        />
                      </div>
                    </div>

                    {/* DEF */}
                    <div className="bg-dark-900/60 p-2 rounded border border-dark-600 flex items-center gap-2">
                      <Shield size={16} className="text-blue-500" />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500">DEFESA</span>
                        <input
                          type="number"
                          className="bg-transparent text-white font-bold w-full focus:outline-none focus:border-b border-primary text-sm"
                          value={selectedMob.Defense || 0}
                          onChange={(e) => handleDetailFieldChange('Defense', parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Attributes STR, AGI, VIT, INT, DEX, LUK */}
                  <div className="bg-dark-900/40 p-3 border border-dark-600 rounded">
                    <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Atributos</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'].map(attr => (
                        <div key={attr} className="bg-dark-900/80 p-1.5 rounded text-center border border-dark-600/50">
                          <div className="text-[10px] text-gray-500 font-bold uppercase">{attr}</div>
                          <input
                            type="number"
                            className="bg-transparent text-white font-bold w-full text-center text-xs focus:outline-none"
                            value={selectedMob[attr] || 1}
                            onChange={(e) => handleDetailFieldChange(attr, parseInt(e.target.value))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* EXP gained */}
                  <div className="bg-dark-900/40 p-3 border border-dark-600 rounded flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Experiência obtida</h4>
                    <div className="flex justify-between items-center bg-dark-900/60 p-1.5 rounded text-xs border border-dark-600/50">
                      <span className="text-gray-400">Base Exp:</span>
                      <input
                        type="number"
                        className="bg-transparent text-white font-bold text-right w-24 focus:outline-none"
                        value={selectedMob.BaseExp || 0}
                        onChange={(e) => handleDetailFieldChange('BaseExp', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="flex justify-between items-center bg-dark-900/60 p-1.5 rounded text-xs border border-dark-600/50">
                      <span className="text-gray-400">Classe Exp:</span>
                      <input
                        type="number"
                        className="bg-transparent text-white font-bold text-right w-24 focus:outline-none"
                        value={selectedMob.JobExp || 0}
                        onChange={(e) => handleDetailFieldChange('JobExp', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Item Drops */}
              {activeTab === 'drops' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Tabela de Drops Normais</h4>
                    {selectedMob.Drops && selectedMob.Drops.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {selectedMob.Drops.map((drop: any, idx: number) => (
                          <div 
                            key={idx} 
                            className="bg-dark-900/60 border border-dark-600 p-2 rounded text-xs flex justify-between items-center hover:border-primary/40 transition"
                          >
                            <span className="text-white font-mono font-semibold">{drop.Item}</span>
                            <span className="text-green-500 font-bold bg-green-950/40 px-2 py-0.5 rounded border border-green-800/40">
                              {(drop.Rate / 100).toFixed(2)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic p-3 text-center bg-dark-900/30 border border-dark-600 rounded">
                        Nenhum item dropado cadastrado.
                      </div>
                    )}
                  </div>

                  {selectedMob.MvpDrops && selectedMob.MvpDrops.length > 0 && (
                    <div className="mt-2">
                      <h4 className="text-xs font-bold text-red-400 uppercase mb-2 flex items-center gap-1">
                        <Award size={14} />
                        Drops MVP
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        {selectedMob.MvpDrops.map((drop: any, idx: number) => (
                          <div 
                            key={idx} 
                            className="bg-red-950/20 border border-red-900/30 p-2 rounded text-xs flex justify-between items-center hover:border-red-800/40 transition"
                          >
                            <span className="text-red-300 font-mono font-semibold">{drop.Item}</span>
                            <span className="text-yellow-500 font-bold bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-800/40">
                              {(drop.Rate / 100).toFixed(2)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: AI Behavior Modes */}
              {activeTab === 'ai' && (
                <div className="flex flex-col gap-2 bg-dark-900/40 p-3 border border-dark-600 rounded text-xs">
                  <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">Comportamento de IA (Modos)</h4>
                  {selectedMob.Modes ? (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(selectedMob.Modes).map((modeKey) => (
                        <div 
                          key={modeKey}
                          className="flex items-center justify-between p-2 bg-dark-900/80 rounded border border-dark-600/50"
                        >
                          <span className="text-gray-400 font-semibold truncate" title={modeKey}>
                            {modeKey}
                          </span>
                          <span className={`h-2.5 w-2.5 rounded-full ${
                            selectedMob.Modes[modeKey] ? 'bg-green-500 animate-pulse' : 'bg-gray-600'
                          }`} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic p-2 text-center bg-dark-900/30 rounded">
                      Modos não definidos (usa IA Padrão).
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 gap-2">
              <Shield size={36} className="opacity-30" />
              <span className="text-sm font-semibold">Nenhum Monstro Selecionado</span>
              <span className="text-xs text-gray-600">Selecione um monstro na grade para ver a animação e editar atributos detalhados.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonsterEditor;
