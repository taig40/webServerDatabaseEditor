import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { ICellEditorParams } from 'ag-grid-community';
import Editor from '@monaco-editor/react';
import { X, Check } from 'lucide-react';

const ScriptCellEditor = forwardRef((props: ICellEditorParams, ref) => {
  // Extrai a string do script para edição
  const getInitialValue = () => {
    if (!props.value) return '';
    if (typeof props.value === 'string') return props.value;
    if (props.value.Script) return props.value.Script;
    return JSON.stringify(props.value, null, 2);
  };

  const [value, setValue] = useState(getInitialValue());
  
  useImperativeHandle(ref, () => {
    return {
      // Retorna o valor final para o ag-grid quando a edição parar
      getValue() {
        return value;
      },
      // Diz ao ag-grid para renderizar nosso editor num "popup"
      isPopup() {
        return true;
      }
    };
  });

  // Usamos createPortal para jogar o modal direto no <body>
  // Isso impede que o CSS restrito do AG Grid (.ag-popup) quebre o tamanho e posição do nosso Modal.
  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => props.stopEditing(true)} // Cancela se clicar fora
    >
      <div 
        className="bg-dark-900 border border-dark-600 rounded-lg shadow-2xl flex flex-col w-[80vw] max-w-5xl h-[80vh]"
        onClick={(e) => e.stopPropagation()} // Impede que clicar dentro feche o modal
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-dark-600 bg-dark-800 rounded-t-lg">
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            Editor de Script <span className="text-sm font-mono text-gray-400 font-normal ml-2">Item: {props.data?.Name || props.data?.Id}</span>
          </h3>
          <div className="flex gap-2">
            <button 
              onClick={() => props.stopEditing(true)} 
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-dark-700 rounded transition"
              title="Cancelar"
            >
              <X size={20} />
            </button>
            <button 
              onClick={() => props.stopEditing(false)} 
              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-dark-700 rounded transition"
              title="Salvar"
            >
              <Check size={20} />
            </button>
          </div>
        </div>
        
        {/* Monaco Editor Body */}
        <div className="flex-1 overflow-hidden relative">
          <Editor
            height="100%"
            defaultLanguage="c" // Hercules/rAthena script é bem parecido com C
            theme="vs-dark"
            value={value}
            onChange={(val) => setValue(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              formatOnPaste: true,
              tabSize: 4,
              insertSpaces: true,
            }}
          />
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-dark-600 bg-dark-800 rounded-b-lg flex justify-end gap-3">
          <button 
             className="px-5 py-2 rounded font-medium text-gray-300 hover:bg-dark-700 transition"
             onClick={() => props.stopEditing(true)}
          >
            Cancelar
          </button>
          <button 
             className="px-5 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-500 transition shadow"
             onClick={() => props.stopEditing(false)}
          >
            Salvar Script
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default ScriptCellEditor;
