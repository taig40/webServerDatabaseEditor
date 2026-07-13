import React, { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useLanguageStore } from '../store/useLanguageStore';
import { initRathenaItemScript, validateItemScript } from '../monaco/rathenaItemScript';

interface ScriptEditorProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  height?: string;
  readOnly?: boolean;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  label = "Script",
  value,
  onChange,
  height = "160px",
  readOnly = false,
}) => {
  const t = useLanguageStore(state => state.t);
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);

  const handleEditorChange = (val: string | undefined) => {
    const nextVal = val || '';
    onChange(nextVal);
    if (monacoRef.current && editorRef.current) {
      validateItemScript(monacoRef.current, editorRef.current.getModel(), t);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 border border-dark-700 rounded-lg overflow-hidden bg-dark-950 p-2">
      <div className="flex justify-between items-center px-1">
        <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary-500 inline-block"></span>
          {label}
        </label>
        <span className="text-[10px] text-gray-500 font-mono">rAthena Bonus Script</span>
      </div>
      <div className="border border-dark-800 rounded overflow-hidden">
        <Editor
          height={height}
          defaultLanguage="rathena-item-script"
          theme="vs-dark"
          value={value || ''}
          beforeMount={(monaco) => {
            initRathenaItemScript(monaco);
          }}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            validateItemScript(monaco, editor.getModel(), t);
          }}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 12,
            fontFamily: 'monospace',
            readOnly: readOnly,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  );
};
