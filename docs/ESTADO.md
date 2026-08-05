# Onde paramos

**Última atualização:** 05/08/2026, fim do dia.
**Leia este arquivo primeiro** ao retomar o projeto.

---

## Em uma frase

O redesign completo das telas está **especificado e aprovado**; nada foi implementado
ainda. O próximo comando é **`/break`**.

---

## O que foi feito hoje (05/08/2026)

### 1. Segurança — feito e validado ✅

Achado: RLS estava ligado nas 11 tabelas, mas todas as policies de leitura eram
`auth.uid() IS NOT NULL` — "qualquer um que criou conta". Com o cadastro do Auth aberto
e a anon key pública, **qualquer pessoa da internet podia ler os 3.132 lançamentos e
editar valores**.

Corrigido em `sql/2026-08-05_blindagem-rls.sql` (commit `28aaf8b`). Validado simulando
os três acessos: intruso passou de 3.132 para **0** linhas; a colaboradora, para **2.872**
(perdeu exatamente as 260 de OQV/PJ).

O Juarez fechou o cadastro no painel. Proteção de senha vazada **não existe no plano
free** — riscada da lista.

### 2. UI — melhorias de base ✅

Commit `e38fe5b`. A tabela renderizava 3.011 linhas de uma vez (~50 mil nós de DOM),
remontadas a cada tecla digitada. Paginação em 200 + debounce + delegação de eventos.
Alvos de toque de 24px → 44px, campos a 16px (o Safari do iPhone dava zoom a cada toque),
contraste de 3,10:1 → 5,81:1.

### 3. Redesign visual — **rejeitado** ❌

Branch `redesign-nomad` (commit `f4593db`), preservado mas **não integrado**. O Juarez
não gostou: apliquei estilo sobre a estrutura antiga em vez de repensar as telas.
Aproveitável de lá: as fontes DM Sans/DM Mono já commitadas em `fonts/`.

### 4. Brainstorming do redesign — concluído ✅

Sessão completa de design, com as decisões registradas em [`spec.md`](spec.md).

---

## Decisões tomadas (não reabrir sem motivo novo)

| Decisão | Escolha |
|---|---|
| Critério de sucesso | **(b) clareza** primeiro, **(d) custo de atenção baixo** |
| Tela inicial | **opção C adaptada** — lidera com clareza e declara a incerteza |
| Eixo principal | **categoria**, em 2 níveis (9 grupos › ~38 subs) |
| Eixo secundário | classificação, com rótulos mais leves |
| Padrão de Análise e orçamento | **grupo** (9), com drill-down |
| Fatia "a classificar" no gráfico | **opção C** — rosca limpa + linha de honestidade |
| Patrimônio | **automatizar o Itaú** pelo sync; manual só o BTG |
| Arquitetura | **vários HTML sem build** + `assets/` compartilhado |

Mockup das 3 telas iniciais que originou a decisão:
[`mockups/2026-08-05-tres-telas-iniciais.html`](mockups/2026-08-05-tres-telas-iniciais.html)
(abrir no navegador).

---

## Pendências do Juarez

1. **Revisar a `spec.md`** e aprovar ou pedir ajustes. O `/break` não começa sem isso.
2. **Gerar as telas no Google Stitch** a partir de [`stitch-prompts.md`](stitch-prompts.md)
   — 7 prompts prontos, um por mensagem. Trazer as imagens ou o link do Figma.
3. **Atualizar o patrimônio.** Está parado desde 05/06 (dois meses), o que torna o
   fôlego de 1,8 meses não confiável.
4. **Autorizar (ou não) gastar 1 das 8 chamadas caras do Open Finance** para verificar
   se o saldo do CDB vem pela API.

---

## Números do sistema em 05/08/2026

| | |
|---|---|
| Lançamentos | 3.132 · 15 meses (mai/25 a jul/26) |
| Sem classificação | **623 (19,9%)** · 30 em julho (22%) |
| Destes, casam com regra existente | **107** — varredura retroativa resolve num clique |
| Regras aprendidas | 520 |
| Categorias em uso | **73** (22 concentram 84,5% do volume) |
| `metas` | **0 linhas** — orçamento nunca foi usado |
| `patrimonio` | 3 linhas · R$ 28.628 total · R$ 16.628 líquido · **parado desde 05/06** |
| Uso do Assistente | 3 perguntas |
| Uso de Alterações | 10 registros |
| Custo de vida jul/26 | R$ 5.569 + até R$ 1.174 sem classificar |
| Média 3 meses (abr–jun) | R$ 9.057/mês |

---

## Estado do repositório

| Branch | Situação |
|---|---|
| `main` | segurança + melhorias de UI + toda a documentação. **No ar** no GitHub Pages |
| `redesign-nomad` | redesign rejeitado. Preservado, **não mesclar** |

Documentos em `docs/`:

- **`spec.md`** — a especificação do redesign (14 seções) ⭐
- `taxonomia-categorias.md` — os 9 grupos e o de-para das 73 categorias
- `stitch-prompts.md` — prompts para gerar as telas
- `architecture.md` · `workflow.md` · `README.md` — o sistema como ele é hoje
- `mockups/` — artefatos visuais das decisões

⚠️ O `CLAUDE.md` do projeto mora **fora do repositório**, em
`C:\Users\Samsung\Documents\Claude\Projects\Pessoal\CLAUDE.md`. Ele continua sendo o
contexto que o Claude Code carrega automaticamente; os documentos técnicos canônicos
passaram a ser os daqui.

---

## Próximo comando

```
/break docs/spec.md
```

A ordem provável das tarefas começa pela **migração de dados** (caminho crítico — bloqueia
Análise e Planejar) e pela camada compartilhada `assets/`. **Não pelas telas**: tela sem
taxonomia consolidada é retrabalho garantido.
