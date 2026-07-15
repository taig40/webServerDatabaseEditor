# ⚔️ rAthena Web Database & Visual Editor
Um ecossistema full-stack avançado para administração de servidores **rAthena**. Este projeto unifica a gestão do Banco de Dados do Servidor (item_db.yml) e a Configuração Visual do Cliente (iteminfo.lua/.lub), trazendo um motor de renderização em tempo real (Visualizer) e testes automatizados para garantir a estabilidade operacional.
## 🎯 Propósito do Projeto
Historicamente, o gerenciamento de itens customizados em emuladores de Ragnarok Online exige malabarismos entre múltiplos arquivos (item_db, accessoryid.lua, accname.lua, iteminfo.lub) e testes cegos no cliente.O propósito desta aplicação é **eliminar a adivinhação e o erro humano**. Ao conectar diretamente o backend Python (lendo as GRFs nativas) a um frontend reativo em React, o editor permite que administradores criem itens, associem sprites (ResourceName), visualizem o personagem equipado em tempo real e salvem as configurações perfeitamente sincronizadas entre Servidor e Cliente.
## 🚀 Pontos Fortes e Funcionalidades
**Motor de Renderização (Live Visualizer):** Compositor de imagem customizado via Pillow (Python) que extrai sprites (SPR/ACT) da GRF, processa paletas de cores e aplica máscaras de canal Alpha (alpha_composite) para renderizar personagens, cabeças e acessórios perfeitamente alinhados e sobrepostos na interface web.
 * **Data Binding Inteligente:** Sincronização de estado reativa. Atualizações feitas nos parâmetros de combate no servidor refletem instantaneamente nas configurações visuais do cliente.
 * **Zero-Latency Asset Preview:** Busca de componentes visuais amarrada estritamente ao ResourceName, permitindo pré-visualização de chapéus e asas customizadas sem depender de IDs pré-compilados em arquivos Lua.
 * **Blindagem de Encoding (CP949/EUC-KR):** O motor possui um parser construído sob medida que força a codificação nativa do cliente coreano, eliminando de forma definitiva falhas de leitura, corrupção de strings e caracteres bizarros (*Mojibake*) nos caminhos dos arquivos.
## 🛠️ Tecnologias Integradas
A arquitetura foi desenhada separando claramente as responsabilidades de extração de dados e interface de usuário:
**Frontend (Client & UI)**
 * **React:** Construção de interface componentizada e reativa.
 * **TypeScript:** Tipagem estática para garantir a integridade dos dados trafegados

**Backend (Engine & API)**
 * **Python 3 & FastAPI:** API RESTful de altíssima performance para roteamento de dados e streaming de arquivos binários (imagens).
 * **Pillow (PIL):** Manipulação e composição de matrizes de pixels para a montagem de sprites em tempo real.
 * **Custom GRF/Lua Parsers:** Módulos de leitura binária para extração de dados diretamente dos arquivos criptografados/compactados do cliente (.grf) e leitura segura de scripts Lua.
## 🛡️ Segurança e Cibersegurança
A implementação seguiu princípios de segurança para garantir que dados sensíveis do ambiente de desenvolvimento e infraestrutura do servidor não sejam expostos:
 1. **Isolamento de Variáveis e Ambientes (Secrets Management):**
   * Arquivos de configuração (.conf, .env) contendo caminhos absolutos de diretórios locais e nomes de usuários do sistema operacional são estritamente ignorados pelo versionamento.

 2. **Sanitização de Inputs e Fallback de Codificação:**
   * O backend bloqueia a injeção acidental de codificações incorretas. Ao forçar o encoding estrito (EUC-KR) com rotinas de errors='ignore', o sistema previne travamentos de buffer (*Buffer Overread/Crash*) causados por caracteres especiais ocidentais não suportados pela engine do jogo.
 3. **Segurança de Rotas e Tratamento Silencioso (Fail-Safe):**
   * Endpoints do FastAPI foram estruturados para capturar exceções de leitura de arquivos (como caminhos inexistentes na GRF) através de logs monitorados no console, retornando respostas tratadas (Status 200 com renderizações base seguras) no lugar de Error 500. Isso evita a exposição de *Stack Traces* e diretórios internos do servidor diretamente no navegador do usuário.
