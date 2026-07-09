import axios from 'axios';
import { API_URL } from '../config/env';

let isRegistered = false;
let intellisenseCache: any = null;

const NPC_ONLY_COMMANDS = [
  'mes', 'menu', 'close', 'close2', 'next', 'select', 'prompt',
  'cutin', 'viewpoint', 'input', 'npctalk'
];

export async function loadItemIntellisense() {
  if (intellisenseCache) return intellisenseCache;
  try {
    const res = await axios.get(`${API_URL}/api/editor/item-intellisense`);
    intellisenseCache = res.data;
    return intellisenseCache;
  } catch (err) {
    console.error('Error loading item intellisense:', err);
    return null;
  }
}

export function initRathenaItemScript(monaco: any) {
  if (!monaco) return;
  if (isRegistered) return;
  isRegistered = true;

  monaco.languages.register({ id: 'rathena-item-script' });

  monaco.languages.setMonarchTokensProvider('rathena-item-script', {
    keywords: [
      'bonus', 'bonus2', 'bonus3', 'bonus4', 'bonus5',
      'heal', 'itemheal', 'percentheal', 'skill',
      'sc_start', 'sc_start2', 'sc_start4', 'getitem', 'getitem2',
      'getrandgroupitem', 'rentitem', 'autospell', 'autospell2', 'autospell3',
      'specialeffect2', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return'
    ],
    tokenizer: {
      root: [
        [/\/\/.*/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/\b[0-9]+\b/, 'number'],
        [/\b(bonus\d?|heal|itemheal|percentheal|skill|sc_start\d?|getitem\d?|getrandgroupitem|rentitem|autospell\d?|if|else|return)\b/, 'keyword'],
        [/\b(b[A-Z][a-zA-Z0-9_]*|Eff_[a-zA-Z0-9_]+|Ele_[a-zA-Z0-9_]+|RC_[a-zA-Z0-9_]+|RC2_[a-zA-Z0-9_]+|BF_[a-zA-Z0-9_]+|ATF_[a-zA-Z0-9_]+|Size_[a-zA-Z0-9_]+|Class_[a-zA-Z0-9_]+)\b/, 'constant'],
        [/[a-zA-Z_]\w*/, 'variable'],
      ],
      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop']
      ]
    }
  });

  // Pre-load intellisense data
  loadItemIntellisense();

  monaco.languages.registerCompletionItemProvider('rathena-item-script', {
    provideCompletionItems: async (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const data = await loadItemIntellisense();
      if (!data) return { suggestions: [] };

      const suggestions: any[] = [];

      // Base commands
      if (Array.isArray(data.base_commands)) {
        data.base_commands.forEach((cmd: any) => {
          suggestions.push({
            label: cmd.label,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: cmd.label,
            detail: cmd.detail || cmd.label,
            documentation: { value: cmd.documentation || cmd.label },
            range
          });
        });
      }

      // Bonuses from doc/item_bonus.txt
      if (Array.isArray(data.bonuses)) {
        data.bonuses.forEach((b: any) => {
          suggestions.push({
            label: b.label,
            kind: monaco.languages.CompletionItemKind.Constant,
            insertText: b.label,
            detail: `${b.command} ${b.label}${b.args ? ',' + b.args : ''}`,
            documentation: { value: b.description || b.label },
            range
          });
        });
      }

      // Constants
      if (Array.isArray(data.constants)) {
        data.constants.forEach((c: any) => {
          suggestions.push({
            label: c.label,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: c.label,
            detail: c.category || 'Constant',
            documentation: { value: c.description || c.label },
            range
          });
        });
      }

      // Items cross-reference
      if (Array.isArray(data.items)) {
        data.items.slice(0, 500).forEach((it: any) => {
          suggestions.push({
            label: `${it.name} (ID: ${it.id})`,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: String(it.id),
            detail: `Item ID: ${it.id}`,
            documentation: { value: `Item: ${it.name} [ID: ${it.id}]` },
            range
          });
        });
      }

      // Skills cross-reference
      if (Array.isArray(data.skills)) {
        data.skills.slice(0, 500).forEach((sk: any) => {
          suggestions.push({
            label: `${sk.name} (Skill: ${sk.id})`,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: String(sk.id),
            detail: `Skill ID: ${sk.id}`,
            documentation: { value: `Skill: ${sk.name} [ID: ${sk.id}]` },
            range
          });
        });
      }

      return { suggestions };
    }
  });
}

export function validateItemScript(monaco: any, model: any, t?: (key: string) => string) {
  if (!monaco || !model) return;
  const content = model.getValue() || '';
  const lines = content.split(/\r?\n/);
  const markers: any[] = [];

  const defaultMsg = "Comando de NPC inválido em scripts de item. Scripts de item devem usar apenas instruções 'bonus'.";
  const errorMessage = t ? t('item_editor.lint_npc_error') : defaultMsg;

  lines.forEach((lineText: string, lineIndex: number) => {
    // Check for comments
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//')) return;

    NPC_ONLY_COMMANDS.forEach((npcCmd) => {
      const regex = new RegExp(`\\b${npcCmd}\\b`, 'g');
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: `${errorMessage} ("${npcCmd}")`,
          startLineNumber: lineIndex + 1,
          startColumn: match.index + 1,
          endLineNumber: lineIndex + 1,
          endColumn: match.index + 1 + npcCmd.length
        });
      }
    });
  });

  monaco.editor.setModelMarkers(model, 'rathena-item-script-linter', markers);
}
