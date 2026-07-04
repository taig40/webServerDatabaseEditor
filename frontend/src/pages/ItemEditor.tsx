import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

import NewItemModal from '../components/NewItemModal';
import ScriptCellEditor from '../components/ScriptCellEditor';

const ItemEditor: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Status de carregamento para arquivos YAML gigantes
  const [loadingStatus, setLoadingStatus] = useState("Conectando ao Backend...");
  const [itemsLoaded, setItemsLoaded] = useState(0);
  
  // Estado para o campo de busca (filtro rápido)
  const [searchText, setSearchText] = useState("");
  
  // Estado para o Modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkStatusAndFetch = async () => {
      try {
        // 1. Pergunta ao backend se a Thread de leitura do ruamel.yaml já acabou
        const statusRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/items/status`);
        const { is_loading, message, items_loaded } = statusRes.data;
        
        setLoadingStatus(message);
        setItemsLoaded(items_loaded);

        if (!is_loading && message !== "Aguardando inicialização...") {
          // Se não está mais carregando, limpamos o intervalo e baixamos a tabela
          if (intervalId) clearInterval(intervalId);
          
          setLoadingStatus("Construindo a DataGrid virtualizada...");
          try {
             // Limite alto o suficiente para os ~100 mil itens do rAthena
             const itemsRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/items/?skip=0&limit=150000`);
             setItems(itemsRes.data.items);
             setIsLoading(false);
          } catch (err) {
             console.error("Erro ao baixar array final:", err);
             setLoadingStatus("Erro ao receber os itens finais.");
          }
        }
      } catch (err) {
        console.error("Erro ao checar status. Servidor offline?", err);
        setLoadingStatus("Servidor offline. Tentando reconectar...");
      }
    };

    // Dispara a checagem imediatamente
    checkStatusAndFetch();
    
    // Configura o Polling a cada 1 segundo (1000ms)
    intervalId = setInterval(checkStatusAndFetch, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const [columnDefs] = useState<ColDef[]>([
    { field: 'Id', headerName: 'ID', width: 80, editable: false, pinned: 'left' },
    { 
      field: 'Icon', 
      headerName: 'Ícone', 
      width: 70,
      editable: false,
      pinned: 'left',
      cellRenderer: (params: any) => {
        if (!params.data || !params.data.Id) return null;
        return (
          <div className="flex justify-center items-center h-full pt-1">
            <img 
              src={`${import.meta.env.VITE_API_URL}/api/grf/sprite?type=item&id=${params.data.Id}`} 
              alt="icon" 
              className="max-h-6 max-w-6 drop-shadow-md"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        )
      }
    },
    { field: 'Name', headerName: 'AegisName', width: 180, editable: true },
    { field: 'Type', headerName: 'Type', width: 120, editable: true },
    { field: 'Buy', headerName: 'Buy', width: 100, editable: true, type: 'numericColumn' },
    { field: 'Sell', headerName: 'Sell', width: 100, editable: true, type: 'numericColumn' },
    { 
      field: 'Weight', 
      headerName: 'Weight', 
      width: 100, 
      editable: true, 
      type: 'numericColumn',
      valueFormatter: (params) => {
        if (params.value == null) return '';
        return Math.ceil(Number(params.value) / 10).toString();
      }
    },
    { field: 'Attack', headerName: 'ATK', width: 80, editable: true, type: 'numericColumn' },
    { field: 'Defense', headerName: 'DEF', width: 80, editable: true, type: 'numericColumn' },
    { field: 'EquipLevelMin', headerName: 'Lvl Min', width: 90, editable: true, type: 'numericColumn' },
    { field: 'Slots', headerName: 'Slots', width: 80, editable: true, type: 'numericColumn' },
    { 
      field: 'Script', 
      headerName: 'Script', 
      width: 400, 
      editable: true, 
      cellEditor: ScriptCellEditor,
      getQuickFilterText: (params) => {
        if (!params.value) return '';
        if (typeof params.value === 'string') return params.value;
        if (params.value.Script) return params.value.Script;
        return JSON.stringify(params.value);
      },
      valueFormatter: (params) => {
        if (!params.value) return '';
        if (typeof params.value === 'string') return params.value;
        if (params.value.Script) return params.value.Script;
        return JSON.stringify(params.value);
      }
    },
  ]);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      sortable: true,
      filter: true,
      resizable: true,
    };
  }, []);

  const searchRegex = /^\[(.*?)\]:\s*(.*)$/i;
  const customSearchMatch = searchText.match(searchRegex);
  const isCustomSearch = !!customSearchMatch;

  const isExternalFilterPresent = useCallback(() => {
    return isCustomSearch;
  }, [isCustomSearch]);

  const doesExternalFilterPass = useCallback((node: any) => {
    if (!customSearchMatch) return true;
    
    const [, fieldRaw, query] = customSearchMatch;
    const field = fieldRaw.toLowerCase();
    
    // Remove aspas simples ou duplas caso o usuário tenha digitado [Script]: "..."
    const queryLower = query.replace(/^["'](.*)["']$/, '$1').toLowerCase();
    
    const data = node.data;
    if (!data) return false;
    
    // Tenta encontrar a coluna correspondente (case-insensitive)
    const key = Object.keys(data).find(k => k.toLowerCase() === field);
    if (!key) return false;
    
    const value = data[key];
    if (value == null) return false;
    
    if (key === 'Script' && typeof value === 'object') {
       const scriptContent = value.Script || '';
       return scriptContent.toLowerCase().includes(queryLower);
    }
    
    return String(value).toLowerCase().includes(queryLower);
  }, [customSearchMatch]);

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    if (event.oldValue === event.newValue) return;

    const itemId = event.data.Id;
    const fieldName = event.colDef.field!;
    
    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/items/${itemId}`, {
        [fieldName]: event.newValue
      });
      console.log(`[webSDE] Item ${itemId} salvo com sucesso!`);
    } catch (error) {
      console.error("[webSDE] Falha ao salvar", error);
      event.node.setDataValue(event.column, event.oldValue);
      alert("Erro de conexão ao salvar a alteração no YAML.");
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex justify-between items-center bg-dark-900 border-b border-dark-600">
        <div>
           <h2 className="text-xl text-white font-semibold">Item Database Editor</h2>
           <p className="text-xs text-gray-400 mt-1">Edição In-Line: Clique em uma célula para editar. O YAML original será preservado.</p>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-semibold rounded text-sm transition shadow"
          >
            + Novo Item Custom
          </button>
          <input
            type="text"
            placeholder="Pesquisar itens..."
            className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded text-sm text-gray-200 focus:outline-none focus:border-primary w-64"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <div className="text-sm bg-dark-800 px-3 py-1.5 rounded border border-dark-600 shadow text-gray-300">
            {isLoading ? 'Lendo YAMLs...' : `${items.length.toLocaleString()} Itens`}
          </div>
        </div>
      </div>
      
      {isModalOpen && (
        <NewItemModal 
          onClose={() => setIsModalOpen(false)} 
          onItemCreated={(newItem) => {
             // Injeta o novo item no topo do array
             setItems(prev => [newItem, ...prev]);
          }}
        />
      )}
      
      <div className="flex-1 overflow-hidden w-full h-full p-2 bg-dark-900 relative">
        
        {/* Overlay de Loading Visível enquanto a Thread Python processa os milhares de YAMLs */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900">
             <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
             <h3 className="text-2xl text-white font-semibold mb-2">Processando Bancos de Dados</h3>
             <p className="text-gray-400 mb-2 font-mono text-sm">{loadingStatus}</p>
             <div className="bg-dark-800 px-4 py-2 rounded-full border border-dark-600">
                <span className="text-primary font-bold text-lg">{itemsLoaded.toLocaleString()}</span>
                <span className="text-gray-500 ml-2">entradas na memória RAM</span>
             </div>
          </div>
        )}

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
            rowData={items}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onCellValueChanged={onCellValueChanged}
            rowSelection="single"
            animateRows={true}
            quickFilterText={isCustomSearch ? "" : searchText}
            isExternalFilterPresent={isExternalFilterPresent}
            doesExternalFilterPass={doesExternalFilterPass}
          />
        </div>
      </div>
    </div>
  );
};

export default ItemEditor;
