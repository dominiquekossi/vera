# Relatório — projeto `vera`

Cockpit de revisão de variantes genéticas construído com Vite + React + TypeScript e
[gosling.js](http://gosling-lang.org). Este documento cobre as quatro tarefas executadas
até agora, incluindo as decisões técnicas, o que foi verificado e o que continua em aberto.

---

## Stack instalada

| Pacote | Versão | Observação |
| --- | --- | --- |
| vite | ^8.1.1 | template `react-ts` |
| react / react-dom | 18.3.1 | **rebaixados** de 19 (ver Tarefa 1) |
| typescript | ~6.0.2 | `tsc -b --noEmit` limpo |
| gosling.js | 1.0.7 | última versão estável |
| higlass | 1.13.6 | peer dependency |
| pixi.js | 6.5.10 | peer dependency |

### Estrutura de arquivos

```
src/
  App.tsx                         # cockpit (Gosling) + painel de dossiê
  components/
    GoslingViewer.tsx             # wrapper do GoslingComponent + captura de clique
    trackScale.ts                 # lê o _xScale do track (pixel→genoma)
    VariantDossier.tsx            # painel lateral de evidência
    VariantDossier.css
  evidence/                       # camada de evidence providers
    types.ts                      # Variant, cache key, NotFoundError
    cache.ts                      # cache de promises por variante
    useEvidence.ts                # hook loading/empty/error/success por fonte
    clinvar.ts / gnomad.ts / omim.ts
    variants.ts                   # loader do CSV de variantes
  specs/overviewDetail.ts         # a spec completa do cockpit
public/data/
  variants.example.csv            # variantes reais do ClinVar (GBA1, LMNA, NTRK1)
  variant-density.example.csv     # as mesmas variantes, pré-agregadas
```

---

## Tarefa 1 — Scaffold do projeto

Projeto inicializado com `npm create vite@latest . -- --template react-ts` e
gosling.js instalado com suas peer dependencies.

### Decisões que exigiram desvio do pedido original

**React 19 → 18.** O template do Vite instala React 19, mas o `gosling.js@1.0.7`
declara peer dependency `react@^16.6.3 || ^17 || ^18`. Não existe versão estável do
gosling compatível com React 19, então rebaixei react, react-dom e os `@types`
correspondentes para a linha 18.

**CSS do HiGlass.** Sem ele o Gosling renderiza em branco. Importado em
`src/main.tsx` a partir do pacote local, e não via CDN:

```ts
import 'higlass/dist/hglib.css'
```

**Remoção do `<StrictMode>`.** Este foi o único ponto que quebrou de fato. Com o
StrictMode ativo o console acusava:

```
Error: Invalid value of `0` passed to `checkMaxIfStatementsInShader`
TypeError: Cannot read properties of null (reading 'destroy')
```

A causa é o double-invoke de efeitos que o React 18 faz em desenvolvimento: o
HiGlass usa componentes de classe antigos com contexto WebGL/PIXI, e a montagem
dupla destrói o renderer. Removido o StrictMode, os erros desapareceram.

---

## Tarefa 2 — Overview + detail ligados por brush

Duas views empilhadas: um ideograma de chr1 (overview) com um mark `brush`
sobreposto, e uma view de detalhe que mostra a região selecionada.

### Correção importante: `xLinkingId` não existe

O pedido original mencionava `xLinkingId`. Essa propriedade **não existe** nesta
versão — verifiquei no schema instalado
(`node_modules/gosling.js/dist/src/gosling-schema/gosling.schema.d.ts`), sem nenhuma
ocorrência. O nome correto é `linkingId`, disponível em dois lugares:

- `CommonViewDef.linkingId` — no nível da view;
- `AxisCommon.linkingId` — dentro do canal x.

Comecei usando a forma do canal x, que é a do exemplo oficial
`CIRCULAR_OVERVIEW_LINEAR_DETAIL`, e depois migrei para o nível da view (ver Tarefa 3).

### Por que a view de detalhe não usa `dummy-track`

O schema tem um `type: 'dummy-track'` descrito como track placeholder, que seria o
candidato natural para "track vazia". Ele **não serve** para provar o brush: é
declarado como `static?: true`, `assembly?: 'unknown'` e não aceita canal x, ou seja,
não recebe `linkingId` nem reage a mudanças de domínio. Serve para reservar espaço
para ferramentas de terceiros. A view de detalhe usa uma track real de cytobands com
eixo genômico no topo.

### Verificação

Testado no navegador arrastando e redimensionando o brush:

- arrastar de ~30–60 Mb para ~150–176 Mb → eixo do detalhe acompanhou;
- alargar o brush em ~120 px → região do detalhe passou de ~27 Mb para ~62 Mb.

---

## Tarefa 3 — Track de cobertura (BigWig)

Track de sinal quantitativo lida diretamente do navegador por HTTP range requests,
sem servidor HiGlass.

### A URL documentada pelo Gosling está morta

Tanto a página de datasets públicos quanto a documentação do tipo `bigwig` citam
apenas `https://s3.amazonaws.com/gosling-lang.org/data/4DNFIMPI5A9N.bw`, que
retorna **403 Forbidden**. Substituí por outro arquivo do mesmo bucket:

```
https://s3.amazonaws.com/gosling-lang.org/data/ExcitatoryNeurons-insertions_bin100_RIPnorm.bw
```

Validado ponto a ponto antes de entrar na spec:

- **É BigWig**: primeiros bytes `26 fc 8f 88` (magic number 0x888FFC26).
- **É hg38**, verificado lendo a árvore de cromossomos do próprio arquivo, e não
  pelo nome: chr1 = 248.956.422 (hg19 seria 249.250.621), chr2 = 242.193.529,
  chrX = 156.040.895. Nomes com prefixo `chr`, iguais aos do dataset de cytobands.
- **CORS e range**: responde 206, com `Access-Control-Allow-Origin: *` e preflight
  `OPTIONS` autorizando o header `range`.

> ⚠️ **Ressalva:** esse arquivo é sinal de ATAC-seq (contagem de inserções
> normalizada), **não** read depth de WGS. Tem o formato certo e valida o
> encanamento, mas os picos não representam profundidade de sequenciamento — não dá
> para tirar conclusões de CNV dele. Para usar cobertura real, basta trocar a
> constante `COVERAGE_URL` em `src/specs/overviewDetail.ts`.
>
> Alternativa hg38 que passou nos mesmos testes:
> `https://hgdownload.soe.ucsc.edu/gbdb/hg38/bbi/gc5BaseBw/gc5Base.bw` (conteúdo GC,
> ainda mais distante de cobertura).

### Mudança estrutural: linking movido para o nível da view

Para as tracks novas herdarem o linking sem repetir o `linkingId` em cada uma, o
link saiu do canal x e foi para a view:

```ts
{
  linkingId: DETAIL_LINK,
  xDomain: { chromosome: 'chr1', interval: [30000000, 60000000] },
  tracks: [ /* cytobands, variantes, cobertura */ ],
}
```

Este era o ponto de risco — mexer no linking podia quebrar o brush do overview.
Testado explicitamente: o brush continua funcionando.

### Verificação

Antes de mexer no brush havia 10 requisições ao `.bw`; após arrastá-lo de ~30–60 Mb
para ~150–176 Mb, subiu para 26 — 16 novas leituras por range request. O padrão de
barras mudou por completo e o eixo y se reescalou sozinho (máximo de ~0,0015 para
~0,001), comportamento de uma track que refez o fetch, e não que apenas reposicionou
pixels.

---

## Tarefa 4 — Track de patogenicidade com zoom semântico

Segue o padrão multi-scale lollipop do exemplo oficial `pathogenic.ts`: um track com
`alignment: 'overlay'` contendo três marks que se alternam por `visibility`.

| Mark | Papel | Condição |
| --- | --- | --- |
| `bar` | haste do lollipop | `zoomLevel` **LT** 1.000.000 bp |
| `point` | cabeça do lollipop | `zoomLevel` **LT** 1.000.000 bp |
| `bar` (dados agregados) | stacked bar de distribuição | `zoomLevel` **GT** 1.000.000 bp |

Todas com `target: 'mark'` e `transitionPadding: 1000000`, que é o que produz o
fade suave em vez de um corte seco. O `threshold` do `zoomLevel` é medido em pares de
base e corresponde à largura da região visível.

### Por que foram gerados dois CSVs

Esta é a diferença mais relevante em relação ao pedido. O pedido pedia um único CSV
com `chrom, pos, significance, gene`, mas **o Gosling não conta linhas de um CSV
bruto para montar um stacked bar** — o `CsvData` não tem `binSize` nem agregação
(confirmado no schema). O exemplo oficial resolve isso exatamente da mesma forma:
usa `clinvar` (beddb) para os lollipops e um segundo dataset `clinvardensity`
(multivec, pré-binado) para as barras empilhadas.

Então há dois arquivos, e o segundo é uma **agregação real** do primeiro, gerada por
script — as contagens somam exatamente 30, não são números inventados.

**Formato 1 — `public/data/variants.example.csv`** (exatamente o pedido):

```csv
chrom,pos,significance,gene
chr1,42025000,Pathogenic,DEMO1
chr1,42075000,Pathogenic,DEMO1
chr1,42125000,Likely_pathogenic,DEMO1
```

- `chrom` — nome do cromossomo com prefixo `chr` (casa com hg38);
- `pos` — posição de base única, declarada em `genomicFields: ['pos']`;
- `significance` — uma das 5 classes abaixo, grafia estilo ClinVar com underscore;
- `gene` — rótulo livre, hoje só usado como agrupamento.

**Formato 2 — `public/data/variant-density.example.csv`** (derivado, bins de 250 kb):

```csv
chrom,binStart,binEnd,significance,count
chr1,42000000,42250000,Likely_pathogenic,2
chr1,42000000,42250000,Pathogenic,3
```

Uma linha por par (bin, classe). O empilhamento acontece porque várias linhas
compartilham o mesmo `binStart` e o `color` é nominal.

### Dados de exemplo

30 variantes sintéticas em três clusters de chr1, cada um com 500 kb e 10 variantes
espaçadas de 50 kb, com perfis deliberadamente distintos para o stacked bar ficar
legível:

| Cluster | Região | Perfil |
| --- | --- | --- |
| DEMO1 | chr1:42.025.000–42.475.000 | predominantemente patogênico |
| DEMO2 | chr1:46.025.000–46.475.000 | predominantemente VUS |
| DEMO3 | chr1:50.025.000–50.475.000 | predominantemente benigno |

> ⚠️ **São dados sintéticos, não registros reais do ClinVar.** Os nomes de gene
> (`DEMO1`/`DEMO2`/`DEMO3`) são fictícios de propósito, para que ninguém confunda
> este arquivo com classificações clínicas reais. Para usar ClinVar de verdade,
> troque `VARIANTS_URL` e regenere o arquivo de densidade.

### Paleta

| Classe | Cor |
| --- | --- |
| `Pathogenic` | `#D62728` (vermelho) |
| `Likely_pathogenic` | `#FF9896` (vermelho claro) |
| `Uncertain_significance` | `#9E9E9E` (cinza) |
| `Likely_benign` | `#98DF8A` (verde claro) |
| `Benign` | `#2CA02C` (verde) |

### Verificação

A transição foi testada nos dois sentidos, por scroll na view de detalhe:

- **~30 Mb visíveis** → três barras empilhadas, uma por cluster, cada uma com a
  distribuição de classes correspondente (vermelha, cinza, verde) e legenda.
- **~600 kb** → zona de transição: lollipops aparecem semitransparentes, que é o
  efeito do `transitionPadding`.
- **~200 kb** → lollipops opacos. Os 4 visíveis batem exatamente com o CSV:
  42.025.000, 42.075.000 e 42.175.000 em vermelho (Pathogenic) e 42.125.000 em rosa
  (Likely_pathogenic), com alturas diferentes conforme a classe.
- **Zoom de volta** → as barras empilhadas retornam e o brush do overview se
  redimensiona junto.

> **Atualização na Tarefa 5:** os dados sintéticos (DEMO1/2/3) descritos acima
> foram **substituídos por variantes reais do ClinVar** (GBA1, LMNA, NTRK1 em
> chr1), porque o painel de dossiê consulta APIs reais e precisava de variantes
> que existissem de verdade. Os dois formatos de CSV e toda a mecânica de zoom
> semântico continuam idênticos — só o conteúdo mudou. Ver a Tarefa 5.

---

## Tarefa 5 — Painel lateral de dossiê da variante

A peça central: um painel React (fora do Gosling) que agrega, numa tela só, a
evidência que o analista buscaria em ClinVar, gnomAD e OMIM/HPO separadamente.

### Quais APIs são reais e quais são mock

**Todas as três fontes são APIs públicas reais — nenhuma ficou como mock.** Testei
o CORS de cada uma a partir do navegador antes de escrever o código; todas
respondem com `Access-Control-Allow-Origin`, então funcionam client-side sem proxy.

| Fonte | API real usada | Status |
| --- | --- | --- |
| ClinVar | NCBI E-utilities (`esearch` + `esummary`, `db=clinvar`) | **Real**, sem chave |
| gnomAD | GraphQL oficial (`gnomad.broadinstitute.org/api`, dataset `gnomad_r4`) | **Real**, sem chave |
| Doença/fenótipo | HPO / Jax ontology (`ontology.jax.org/api/network`) | **Real**, sem chave |

**Um TODO honesto sobre OMIM:** a API oficial do OMIM (`api.omim.org`) exige chave
por instituição e proíbe chamadas do navegador, então não dá para embutir o texto
do OMIM (herança, variantes alélicas) client-side sem um proxy com a chave. Em vez
de mockar, obtenho as doenças pela API do HPO — que **já retorna os identificadores
OMIM reais** de cada doença — e construo o link direto para a entrada do OMIM. Está
marcado como `TODO(real OMIM API)` em [src/evidence/omim.ts](src/evidence/omim.ts).
Ou seja: os dados de doença são reais e os links de OMIM apontam para a entrada
correta; só o corpo de texto do OMIM é que fica como link em vez de embutido.

### Como capturei o clique (a parte difícil)

Isto exigiu investigação real. O plano óbvio — o evento `click` a nível de mark do
gosling.js — **não funciona nesta versão (1.0.7)** para esta track sobreposta:
verifiquei que só o `trackClick` dispara (e ele não carrega o dado da variante).
Testei `mouseEvents` no pai e nos sub-marks, sem efeito.

A solução robusta lê a escala do próprio track HiGlass. O renderizador do Gosling
usa `_xScale.invert(mouseX)` internamente, então uso a mesma escala: capturo o
clique no DOM, converto pixel→coordenada genômica pelo `_xScale` do track, e a
linha (y) do clique → classe de significância pela ordem das linhas. Isso está
encapsulado em [src/components/trackScale.ts](src/components/trackScale.ts), que
alcança os internos do HiGlass com guardas — se a estrutura mudar, retorna null e o
clique simplesmente não faz nada, sem quebrar.

**Por que resolver por X e Y juntos:** as variantes reais de um gene ficam a
poucas centenas de bp umas das outras — visualmente empilhadas quase no mesmo X, em
linhas diferentes. Só por X, clicar no lollipop vermelho (Pathogenic) retornava o
Benign. Combinando X (posição) e Y (linha de significância) num match 2D, cada cor
resolve para a classe certa. Verifiquei: clique no topo → Pathogenic, meio →
Uncertain significance, base → Benign.

Um detalhe de layout que descobri no caminho: o `#root` do template Vite tinha
`width: 1126px`, menor que o cockpit, o que gerava scroll horizontal — e o scroll
deslocava a origem do canvas, quebrando o mapeamento do clique. Corrigido para
largura total.

### Arquitetura: camada de evidence providers

Um módulo por fonte, cada um com uma função async `(variant) => dados`, exatamente
como pedido:

- [src/evidence/clinvar.ts](src/evidence/clinvar.ts) — busca por posição hg38,
  filtra o alelo por ref/alt, extrai classificação, condições e link VCV.
- [src/evidence/gnomad.ts](src/evidence/gnomad.ts) — query GraphQL, soma exoma +
  genoma, agrega as frequências por grupo de ancestralidade (descartando os
  sub-cohorts por sexo), monta o link.
- [src/evidence/omim.ts](src/evidence/omim.ts) — doenças e termos HPO do gene, com
  links OMIM/Orphanet.

Peças de suporte:

- [src/evidence/cache.ts](src/evidence/cache.ts) — cache por variante que guarda a
  **promise** (não só o valor), então dois componentes pedindo a mesma variante
  compartilham uma requisição; rejeições são removidas para permitir retry.
- [src/evidence/useEvidence.ts](src/evidence/useEvidence.ts) — hook que roda um
  provider e expõe os estados `idle | loading | empty | error | success`. Cada
  fonte tem sua própria chamada do hook, então **uma fonte falhar não derruba as
  outras** — e distingo "sem registro" (`NotFoundError`) de "falhou de verdade".
- [src/components/VariantDossier.tsx](src/components/VariantDossier.tsx) — o painel,
  com um componente `Section` genérico que renderiza o badge de estado
  (loading/failed/no record) por fonte.

### Verificação

Testei o fluxo completo no navegador clicando em variantes reais:

- **GBA1 chr1:155.240.628 (Pathogenic, splice `c.115+2T>G`)** → ClinVar mostra
  Pathogenic + Gaucher disease + link VCV004817680; gnomAD mostra **"no record"**
  (variante rara, ausente da população — badge cinza, esperado); Doença mostra as
  várias formas de Gaucher com links OMIM/Orphanet e 12 termos HPO. Este caso é a
  própria demonstração do isolamento por fonte: gnomAD vazio, as outras duas OK.
- **GBA1 chr1:155.240.171 (Benign)** → gnomAD retorna frequência real 0,864%
  (rs114217696) com a distribuição por ancestralidade; ClinVar Benign.
- Clicar em classes diferentes resolve a significância correta (teste 2D acima).

---

## Como rodar e testar

```bash
npm run dev
```

Abra `http://localhost:5173`. À esquerda, o cockpit Gosling (ideograma de chr1 com
brush, e a view de detalhe com cytobands, variantes e cobertura); à direita, o
painel de dossiê.

1. **Brush** — arraste o retângulo azul no ideograma, ou puxe suas bordas para
   redimensionar. As três tracks do detalhe acompanham.
2. **Zoom semântico** — dê scroll sobre a view de detalhe para aproximar num dos
   genes (GBA1 ~155,24 Mb, LMNA e NTRK1 mais à direita, todos em chr1:155–157 Mb).
   Abaixo de 300 kb de região visível o stacked bar vira lollipops; o caminho de
   volta também funciona.
3. **Dossiê** — com os lollipops visíveis, clique num deles. O painel à direita
   abre com ClinVar, gnomAD e doença/fenótipo daquela variante. Clicar em cores
   diferentes (alturas diferentes) seleciona a classe correspondente.
4. Zoom e pan na view de detalhe também movem o brush no overview — o link é
   bidirecional.

---

## Tarefa 6 — Finalização do MVP (caso de demonstração + polish)

O objetivo foi deixar o MVP redondo e demonstrável, sem features novas.

### Caso de demonstração coerente

Até aqui, a cobertura (BigWig de ATAC-seq) e as variantes contavam histórias
diferentes — não havia um CNV alinhado às variantes. Para o MVP montei um caso
único e coerente em torno do **LMNA**:

- **Por que LMNA:** suas 12 variantes reais do ClinVar se espalham por ~24 kb
  (não amontoadas como o GBA1 de 956 bp), então os lollipops ficam separados e
  clicáveis; tem 3 patogênicas + 3 VUS; e é um gene real de laminopatia
  (cardiomiopatia dilatada), o que dá uma história clínica plausível para um CNV.
- **Cobertura simulada:** troquei o BigWig por um CSV sintético
  (`coverage.example.csv`) — baseline ~30× com uma **deleção heterozigótica**
  caindo para ~15× exatamente sobre o LMNA. Está rotulado como "simulated" no
  título da track e no README. Essa foi uma decisão consciente: o caso pedido
  exige a queda de cobertura co-localizada com as variantes, e não havia um BigWig
  real que contasse isso. A capacidade de ler BigWig nativamente (Tarefa 3)
  continua no histórico; é só trocar a `data` da track para reativá-la.
- **Estado inicial:** o domínio da view de detalhe abre em chr1:156.095.000–
  156.160.000, onde a deleção e os lollipops (com patogênicas em vermelho) já estão
  visíveis. A história completa aparece ao carregar: brush na região → cobertura
  sugere CNV → lollipop mostra patogenicidade → clique abre o dossiê.

### Polish

- Cabeçalho HTML do app (título "Vera — variant review cockpit" + uma linha
  explicando o caso), substituindo o `title`/`subtitle` que ficavam dentro do
  canvas do Gosling (removê-los não quebra a captura de clique, porque a posição
  do track é lida dinamicamente).
- Layout de duas colunas: cockpit à esquerda ocupando o máximo, dossiê à direita.
- Estado inicial com o dossiê fechado (o `selected` começa `null`).

### Verificação

- **História na carga:** screenshot confirma a deleção (~30×→~15×) alinhada aos
  lollipops, com patogênicas em vermelho sobre a região da deleção.
- **Clique no caso demo:** cliquei na patogênica LMNA chr1:156.134.390
  (`c.514-13T>A`) → dossiê abriu com ClinVar Pathogenic + "Cardiovascular
  phenotype" (VCV004820551), gnomAD "no record" (variante rara, esperado), e as
  laminopatias reais (cardiomiopatia dilatada, distrofia muscular, Charcot-Marie-
  Tooth) com links OMIM/Orphanet.
- **Brush controla tudo:** arrastar o brush moveu as três tracks do detalhe
  (cytoband, variantes, cobertura) para o mesmo domínio novo, em conjunto.

---

## Estado atual e pontos em aberto

**Verificado:** `npx tsc -b --noEmit` passa limpo, o que valida a spec inteira contra
os tipos do gosling.js instalado. Sem erros de aplicação no console e sem overlay de
erro do Vite.

**Ruído conhecido no console** (não são erros de aplicação, nada quebra):

- Três warnings de depreciação do React vindos do código legado do HiGlass
  (`findDOMNode`, legacy `childContextTypes`/`contextTypes`). Apareceriam em qualquer
  app React 18 com esta versão do gosling.js.
**Pendências para virar cockpit de verdade:**

- Trocar a cobertura simulada (`coverage.example.csv`) por read depth real da
  amostra — voltando à leitura de BigWig da Tarefa 3 ou a um endpoint próprio.
- Substituir texto do OMIM embutido (hoje é link) por conteúdo real via proxy
  server-side com chave — ver o `TODO` em `omim.ts`.
- A captura de clique depende de internos do HiGlass (`_xScale`), porque o evento
  de mark do gosling.js 1.0.7 não dispara aqui. Está isolada e com guardas em
  `trackScale.ts`, mas é o ponto que mais mereceria revisão ao subir de versão do
  gosling.js (a v2-alpha pode já expor o evento corretamente).
- O match de clique usa uma faixa vertical calibrada (`HEAD_BAND` em
  `GoslingViewer.tsx`) para as linhas de significância; se a `range` do eixo y da
  track mudar, esses fatores precisam ser reajustados.
- Sem StrictMode, o app perde as checagens de desenvolvimento do React; se isso
  incomodar, uma alternativa é isolar o `GoslingViewer` fora da árvore em StrictMode.
- O dossiê não cacheia entre reloads (o cache é em memória, por sessão).
