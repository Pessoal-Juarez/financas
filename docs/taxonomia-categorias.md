# Taxonomia de categorias — proposta

> Estado em 05/08/2026: 73 categorias em texto livre, sem hierarquia.
> "Outros" é 31% de julho — a maior fatia do gráfico não explica nada.
> Decisão do Juarez: dois níveis (grupo › subcategoria), com edição e criação livres.

## Base da proposta

- **Plaid Personal Finance Categories** — padrão de mercado, usado por milhares de
  apps. Reduziu de 600+ para **16 grupos / 104 subcategorias** porque excesso de
  categoria confunde. Fonte da regra "poucas e bem definidas".
- **POF/IBGE** — referência brasileira de orçamento doméstico, ~11 grupos de despesa.
  Usar grupos próximos aos dela permite comparar seu padrão com a média nacional.
- Para **uma família** (não um app comercial), 16/104 é excesso. Proposta: **9 grupos,
  ~40 subcategorias**.

## Princípios

1. **Grupo responde "que tipo de vida isso sustenta"**; subcategoria responde "o quê".
2. **Uma transação tem uma subcategoria**; o grupo vem por herança. Nunca se classifica
   grupo direto.
3. **Movimentação não é categoria.** Pagamento de fatura, transferência, resgate e
   estorno saem do eixo de gasto e viram `cls = Não conta`.
4. **Sem incerteza no rótulo.** `Clínica?` não é categoria — é uma classificação
   pendente. Isso pertence à fila de triagem, não ao nome.
5. **Editável.** O usuário cria e renomeia. A lista abaixo é o ponto de partida, não
   uma prisão.

## Os 9 grupos

| Grupo | Subcategorias |
|---|---|
| **Alimentação** | Supermercado · Restaurante · Delivery · Água (galão) |
| **Moradia** | Aluguel/Moradia · Energia · Água · Gás · Internet/Telefonia · Manutenção da casa |
| **Saúde** | Farmácia · Consulta/Exame · Terapia · Plano de saúde |
| **Transporte** | Combustível · App/Táxi · Estacionamento · Manutenção do carro · Veículo |
| **Cuidado pessoal** | Vestuário · Estética/Beleza · Barbearia · Academia · Esporte · Pet |
| **Educação** | Curso · Mentoria |
| **Lazer** | Viagem · Assinaturas · Presente · Outros lazer |
| **Serviços & obrigações** | Secretária/Babá · Software/Ferramentas · Contabilidade · Impostos · Tarifas bancárias |
| **Empresas** | Insumos · Embalagens · Revenda · Sala · Equipamento |

## De-para das 73 atuais

### Viram subcategoria direto
Supermercado · Restaurante · Farmácia · Combustível · Transporte → App/Táxi ·
Energia · Água · Gás · Estacionamento · Vestuário · Academia · Pet · Terapia ·
Barbearia · Esporte · Viagem · Presente · Contabilidade · Impostos ·
Estética/Beleza · Moradia → Aluguel/Moradia · Embalagens · Sala · Equipamento ·
Secretária/Babá · Água (galão) · Lazer → Outros lazer · Casa → Manutenção da casa

### Fundem (mesma coisa escrita de vários jeitos)
| Vira | Absorve |
|---|---|
| Curso | `Curso`, `Curso `, `Curso (trading)` |
| Mentoria | `Curso/Mentoria` |
| Assinaturas | `Assinatura`, `Assinatura/Cloud` |
| Software/Ferramentas | `Assinatura/Software`, `Ferramenta/Software` |
| Internet/Telefonia | `Telefonia`, `Telefonia/Internet` |
| Impostos | `Impostos`, `Impostos `, `Tarifa/Imposto` |
| Tarifas bancárias | `Tarifa cartão` |
| Revenda | `Revenda`, `Revenda móveis`, `Revenda/Materiais` |
| Insumos | `China/Insumos`, `Compras/Insumos` |
| Manutenção do carro | `Automotivo` |
| Consulta/Exame | `Saúde`, `Clínica` |
| Veículo | `Carro/Grande` |

### Saem do eixo de gasto → `cls = Não conta`
`Pagamento cartão` · `Transfer. própria` · `Transfer./investimento` ·
`Transfer./estorno` · `Resgate CDB` · `Investimento` · `Estorno` · `Desconto` ·
`Recebível sociedade antiga` · `Dividendos (sociedade antiga)` ·
`Venda de veículo` · `Venda de veículo (moto)` · `Internacional`

Não são despesa — são movimentação de dinheiro. Hoje poluem o gráfico e inflam
totais. `Transfer. própria` sozinha soma R$ 82.633 e `Resgate CDB` R$ 137.474.

### Voltam para a fila — mas para a fila de HISTÓRICO, não para a triagem
`Outros` (355 lançamentos!) · `Indefinido` (69) · `Clínica?` ·
`Locação (não confirmado)` · `Receita a identificar` · `Serviços` ·
`Despesa OQV` · `Loja esposa` · `Receita clínica`

Rótulo com "?" ou "a identificar" é dívida escondida no dado. Vai para a fila
com o motivo visível.

> ⚠️ **Medido em 06/08/2026:** essas 9 categorias somam **387 lançamentos que ainda não
> estavam pendentes** (R$ 21.754 em saídas). Jogá-los na triagem levaria a fila de
> **623 para 1.010** — o app redesenhado estrearia com mais trabalho do que o atual.
>
> **Decisão:** eles vão para uma segunda fila, **"Arrumar o histórico"**, dentro de
> "Mais" — sem contador na navegação, sem prazo, ordenada por valor decrescente. A
> triagem do fluxo corrente segue intocada em 623 → 516. Ver `spec.md` §4 e §7.

## O que isso exige do banco

Hoje `transacoes.categoria` é texto livre — por isso a dispersão. Proposta mínima:

- Tabela `categorias`: `id`, `grupo`, `nome`, `ativa`, `ordem`.
- `transacoes.categoria_id` como FK (mantendo `categoria` texto durante a transição,
  para não quebrar a VPS e as 520 regras de uma vez).
- Migração em duas fases: primeiro popular e mapear, depois trocar a leitura do front.

⚠️ **A tabela `regras` referencia categoria por texto.** Renomear categorias sem
atualizar as 520 regras faz a auto-classificação parar de acertar. A migração tem
que tratar as duas juntas — está no caminho crítico, antes de qualquer tela nova.

## Fontes

- [Plaid — Personal Finance Category taxonomy](https://plaid.com/blog/transactions-categorization-taxonomy/)
- [Plaid — guia de migração das categorias](https://plaid.com/docs/transactions/pfc-migration/)
- [IBGE — Pesquisa de Orçamentos Familiares (POF) 2017-2018](https://www.ibge.gov.br/estatisticas/sociais/populacao/24786-pesquisa-de-orcamentos-familiares-2.html)
