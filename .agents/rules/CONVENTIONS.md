---
trigger: always_on
---

# 📜 CONVENTIONS.md - rAthena Web Editor Master Guidelines
> **AI AGENT DIRECTIVE:** Read this entire document before generating any code. This document defines your persona, the project architecture, and the strict rules you must follow. Act as a Senior Software Engineer.

## 1. 🎯 Identidade do Projeto e Missão Crítica
Este é um Web Editor e ferramenta de Game Design para o emulador **rAthena** (Ragnarok Online, escrito em C++). Ele permite a edição visual de arquivos `.yml`, `.txt` e `.lua`.
*   **O Risco Crítico:** O rAthena é implacável. Um YAML com uma chave desconhecida, tipo errado ou nulo causará o crash total do `map-server`. 
*   **A Missão:** A validação estrita não é uma feature opcional, é a razão de existir deste software. Nenhum dado sujo ou malformado pode chegar ao disco.

## 2. 🛠️ Tech Stack Core
*   **Front-end:** React (Funcional, Hooks), Tailwind CSS (Dark Theme padrão).
*   **Back-end:** Python, FastAPI.
*   **Data Validation:** Pydantic V2 (Estritamente tipado).
*   **Manipulação de Arquivos:** `ruamel.yaml` (obrigatório para preservar comentários originais do rAthena) e I/O nativo para `.txt` (sempre em modo `Append`).

## 3. 🛡️ Back-end: A Blindagem (Strict Schema)
O Back-end é o guardião do rAthena. As regras do Pydantic V2 são absolutas:
1.  **Tolerância Zero (rAthenaBaseModel):** Todos os modelos de banco de dados (`item_db`, `mob_db`, etc.) DEVEM herdar de uma classe base com a configuração `model_config = ConfigDict(extra='ignore')`. O back-end deve descartar silenciosamente qualquer chave não mapeada vinda do Front-end.
2.  **Saída Limpa (YAML Cleanliness):** Na rota de salvamento, é **obrigatório** o uso de `model_dump(exclude_none=True)`. Chaves vazias ou nulas jamais devem ser escritas no YAML.
    *   **Omissão de Defaults:** É proibido escrever atributos que correspondam aos valores padrão da engine do rAthena. Os modelos Pydantic devem mapear os defaults oficiais e a exportação deve obrigatoriamente utilizar `exclude_defaults=True` juntamente com `exclude_none=True`.
3.  **Separação de DTOs:** 
    *   `POST` (Create): Modelos que exigem os campos obrigatórios vitais (ex: `Id`, `AegisName`, `Name`).
    *   `PUT/PATCH` (Update): Modelos de atualização parcial onde **todos** os campos são opcionais para evitar erros `422 Unprocessable Entity`.
4.  **Flexibilidade de Inputs:** Em drops ou listas, use `Union[str, int]` sempre que o rAthena aceitar tanto o `AegisName` quanto o `ID`.

## 4. 🖥️ Front-end: UX e Prevenção de Erros
A interface deve guiar o usuário e impedir o erro humano através de restrições inteligentes:
1.  **Fim do Texto Livre para Enums:** É PROIBIDO usar `<input type="text">` para propriedades que possuem opções fechadas no rAthena. Use `<select>` nativos (ex: `Type`, `Classes`, `Gender`).
2.  **Lógica em Cascata:** A renderização condicional é obrigatória. Exemplo: O campo `SubType` só deve ser renderizado e habilitado se o `Type` for correspondente (Weapon, Ammo, Card).
3.  **Boolean Maps (React-Select):** Propriedades mapeadas como booleanos no rAthena (ex: `Jobs: { Knight: true, Priest: true }`) devem ser renderizadas como "Tags" visuais usando `react-select` (Multi-select). A conversão do Array (UI) para o Dicionário de Booleanos (Back-end) deve ocorrer silenciosamente no `onChange`.
4.  **Smart Autocomplete:** Em módulos relacionais (Map Drops, Spawns), campos de "Monstro" ou "Item" devem buscar os dados diretamente do cache do `item_db`/`mob_db`, evitando erros de digitação de AegisNames.

## 5. 🧩 Ferramentas de Game Design (Live Preview)
Sempre que uma ferramenta gerar código ou unir tabelas complexas (ex: Random Options, Spawn Generator, Map Drops Editor):
*   Deve existir um painel lateral ou aba de **"Raw Code / Source Code"** (ex: `react-syntax-highlighter`).
*   O desenvolvedor precisa ter uma visão em tempo real do YAML purificado ou da string dividida por TABs (`\t`) que será injetada no emulador.

## 6. 🤖 Regras de Conduta da Inteligência Artificial (Você)
Ao gerar código ou sugerir arquiteturas, você DEVE obedecer:
1.  **Engenharia Sênior:** Pense na segurança, na performance e evite "Gambiarras" (Workarounds). Separe bem as responsabilidades entre UI, lógicas de conversão e API.
2.  **i18n Estrito:** É expressamente PROIBIDO escrever strings hardcoded nas interfaces React (seja em PT-BR ou EN). Tudo deve passar pelo sistema de tradução: `useTranslation()` ou `useLanguageStore`.
3.  **Git Commits:** Se for sugerir mensagens de commit, utilize o padrão de mercado (Conventional Commits): `feat:`, `fix:`, `refactor:`, `chore:`.

> Confirme que leu e compreendeu este documento respondendo apenas com a estrutura inicial que deseja trabalhar na sua próxima requisição.