# Finanças da Família

App web de finanças pessoais e empresariais de uma família de duas pessoas. Lê os
lançamentos do banco e do cartão automaticamente e ajuda a enxergar o **custo de vida
real**, separando pessoal de empresas.

Não é um banco: não há transferência, pagamento nem gestão de cartão.

**No ar:** https://pessoal-juarez.github.io/financas/

---

## Comece por aqui

| Documento | Para quê |
|---|---|
| **[`docs/ESTADO.md`](docs/ESTADO.md)** | ⭐ **onde o projeto parou e qual o próximo passo** |
| [`docs/architecture.md`](docs/architecture.md) | como as peças conversam |
| [`docs/workflow.md`](docs/workflow.md) | regras de negócio e fluxos |
| [`docs/spec.md`](docs/spec.md) | a especificação do redesign em andamento |

---

## Subir o ecossistema do zero

O sistema tem **três partes independentes**. Nenhuma exige build.

### 1. Front (este repositório)

```bash
git clone https://github.com/Pessoal-Juarez/financas.git
cd financas
python -m http.server 8000 --bind 127.0.0.1
# abrir http://127.0.0.1:8000
```

Não há `npm install` nem passo de build — é HTML, CSS e JS servidos direto.

**Deploy:** `git push` na `main`. O GitHub Pages republica em ~1 minuto.

> A URL do Supabase e a anon key ficam embutidas no HTML. **Isso é correto** — a anon key
> é pública por design e a proteção real é o RLS. O repositório é público.

### 2. Banco (Supabase)

Projeto `urlxbgngcncndtnhyqyf`, plano free. Para recriar do zero, aplicar os arquivos de
`sql/` em ordem cronológica. O mais recente e mais importante é
`sql/2026-08-05_blindagem-rls.sql`, que contém o modelo de autorização.

Depois de aplicar, criar os usuários no painel de Auth e inserir a linha correspondente
em `perfis` com `role` = `admin` ou `colab`. **Sem linha em `perfis`, o usuário não vê
nada** — é assim por segurança.

⚠️ **Manter o cadastro (sign up) desligado** em Authentication → Sign In / Providers.
Ligá-lo permite que qualquer pessoa crie conta.

### 3. Sync automático (VPS)

Claude Code em `/root/financas/` na VPS, com crons. Precisa de:

- `.env` com `SB` (URL) e `SR` (service_role), `chmod 600`
- MCP do Open Finance (Cumbuca) configurado e com consentimento ativo
- os scripts `sync.sh`, `sync-cartao.sh`, `check-comandos.sh`, `perguntar.sh`

Detalhes dos crons e das cotas em [`docs/architecture.md`](docs/architecture.md).

O front funciona sem a VPS — só não recebe lançamentos novos automaticamente.

---

## Estrutura

```
financas/
├── index.html              app principal
├── dashboard.html          gráficos
├── manifest.webmanifest    PWA (start_url = "." — não mudar)
├── fonts/                  DM Sans + DM Mono, auto-hospedadas
├── sql/                    migrações aplicadas
└── docs/                   documentação e especificações
```

---

## Convenções que evitam quebrar o app

- **Paginar todo SELECT** — o PostgREST corta em 1.000 linhas e a base tem 3.132.
- **Nunca escrever policy com `auth.uid() IS NOT NULL`** — isso libera para qualquer um
  que criou conta, não para a família. Usar `eh_membro()` e `is_admin()`.
- **Campo de digitação no mobile em 16px** e alvo de toque de 44px.
- **Renomear categoria exige atualizar `regras` na mesma transação.**
- **Nunca commitar a `service_role`.**

Lista completa em [`docs/workflow.md`](docs/workflow.md).

---

## Branches

| Branch | Situação |
|---|---|
| `main` | o que está no ar |
| `redesign-nomad` | tentativa de redesign **rejeitada**. Preservada, não mesclar |
