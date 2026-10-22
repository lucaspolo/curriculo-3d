# curriculo-3d

Currículo interativo do Lucas Polo em three.js. A página rola por "estações": cada experiência
profissional vira uma cena animada (Kafka, Trust & Privacy, LLMs, Kubernetes, Magalu, Porto Seguro,
origens) e termina numa visão geral com contato.

O conteúdo foi tirado do LinkedIn (`linkedin.com/in/lucaspolo`) em 21/10/2026. Ao atualizar o
currículo, atualize o texto em `index.html` e, se mudar algo que aparece nas cenas (nomes de
serviços, anos da linha do tempo), o módulo da estação correspondente.

## Stack

| Ferramenta | Versão | Observação |
| --- | --- | --- |
| Node | 26.12.1 | via `mise.toml` |
| Vite | 8.3.5 | dev server e build |
| three.js | 0.186.1 | renderer, bloom (`UnrealBloomPass`), rótulos (`CSS2DRenderer`) |
| Fontes | @fontsource 5.3.0 | Space Grotesk, Inter, JetBrains Mono |

## Como a página funciona

```
index.html  <section data-station="kafka">  ──►  STATIONS.kafka()  ──►  { group, view, pickables, update }
                   │                                                        │
       scroll ─► stationProgress() ─► Stage.setProgress(p) ─► câmera interpola entre views
```

- O HTML tem o currículo inteiro. Sem WebGL (ou sem JS) a página continua legível; o three.js só é
  carregado (import dinâmico) quando há WebGL.
- A ordem das `<section>` define a ordem da viagem. O `data-station` é a chave em
  `src/stations/index.js`.
- `progress` é contínuo: `2.5` = metade do caminho entre a estação 2 e a 3. `travel()` segura a
  câmera parada perto de cada seção e só viaja no meio do scroll.
- Cada estação fica em `x = índice × 80`, a não ser que defina `place` (a visão geral usa).

## Contrato de uma estação

```js
{
  id,          // mesmo nome do data-station; usado pelos botões data-action="id:acao"
  group,       // THREE.Group; o Stage posiciona
  view: { pos, target, fogFar, narrowScale?, narrow?: { pos, target } },  // locais da estação; narrow = enquadramento no celular
  pickables,   // meshes com userData.info = { title, text } e, opcional, userData.onClick
  actions?,    // funções chamadas pelos botões do HTML; retornar boolean atualiza aria-pressed
  update(dt, time, focus),  // focus: 1 centralizada, 0 a uma estação de distância
  shift?,      // THREE.Vector3 somado ao enquadramento; a estação move a câmera dentro de si (abas)
  bindUi?(section),  // liga controles próprios do card (ex.: abas da cena de LLMs)
}
```

## Estrutura

```
index.html            todo o texto do currículo (fonte única do conteúdo)
src/main.js           scroll → progress, pontos de navegação, botões, carga do 3D
src/wheel-step.js     um gesto de roda/trackpad = um tópico (desktop)
src/stage.js          renderer, bloom, câmera guiada pelo scroll, picking e tooltip
src/lib/progress.js   matemática pura do scroll (testada em tests/)
src/lib/kit.js        cores, rótulos, caixas com borda, tubos e Flow (mensagens nos tubos)
src/stations/*.js     uma cena por arquivo (partes grandes à parte: magalu-logistics, privacy-cascade, llm-vignettes)
tests/                node --test
```

## Comandos

```bash
npm run dev       # http://localhost:5174
npm test          # testes da matemática de scroll
npm run build     # gera dist/ com base relativa, publicável em qualquer subpasta
```

## Publicação

O site está em **https://sobre.lucaspolo.dev**, servido pelo GitHub Pages do repositório
`lucaspolo/curriculo-3d`. Cada push na `main` roda `.github/workflows/deploy.yml`, que instala o
Node do `mise.toml`, roda os testes, faz o build e publica o `dist/`.

- O domínio é configurado nas configurações do Pages do repositório (via API), e **não** por um
  arquivo `CNAME`: com o Pages publicado por Actions, esse arquivo é ignorado.
- O DNS de `sobre.lucaspolo.dev` é um registro CNAME apontando para `lucaspolo.github.io`. Se
  remover o domínio do Pages sem apagar o registro, o subdomínio fica vulnerável a takeover.

## Armadilhas

- ⚠️ Cores acima de 1.0 (`glow()`) com `toneMapped: false` são o que acende no bloom. Trocar por
  cor comum apaga o brilho; subir demais estoura a cena inteira em branco.
- ⚠️ `Flow` desliga o frustum culling do `InstancedMesh`. As instâncias ficam longe da origem da
  geometria e, com culling ligado, somem quando a câmera se mexe.
- ⚠️ O deslocamento da cena para o lado do card usa `camera.setViewOffset`, e não um alvo deslocado.
  Assim o raycaster continua acertando os objetos sob o mouse. No desktop, o espaço livre é medido no
  DOM (`freeArea()` em `main.js`: da borda do card até os pontos de navegação). Uma estimativa fixa
  funcionava em 1920px, mas em janelas de ~1100px a cena ficava atrás do card. Quando sobra menos
  espaço, a câmera recua (`DESKTOP_ASPECT` em `stage.js`).
- ⚠️ O breakpoint de 800px está em três lugares: `styles.css`, `Stage.resize()` e `narrow()` em
  `main.js`. Se mudar um deles sem mudar os outros, no celular a câmera para com a cena atrás do card.
- ⚠️ No celular a estação "chega" quando o topo do card atinge 58% da tela, e não quando a seção está
  centralizada. Com a regra do desktop, o card cobre a cena. O valor fica só em `--read-line`, no
  `styles.css`: o scroll snap usa ele no `scroll-margin-top` do card e o `main.js` lê o mesmo valor.
  Se os dois divergirem, o snap para num ponto e a câmera espera outro.
- ⚠️ A rolagem para em um tópico por gesto, em duas camadas. A primeira é o CSS:
  `scroll-snap-type: y mandatory` com `scroll-snap-stop: always`, e vale para toque, teclado e barra
  de rolagem. O alvo do snap é a seção no desktop e o card no celular. A segunda é
  `src/wheel-step.js`, que vale para roda e trackpad em telas largas. O snap nativo escolhe a seção
  *mais próxima*: um gesto curto volta para o lugar e a inércia do trackpad pula tópicos. Por isso o
  `wheel-step` avança exatamente uma seção por gesto e descarta a inércia até o gesto terminar.
  Não remova uma camada achando que a outra basta.
- ⚠️ Uma seção mais alta que a tela continua rolável por dentro. O CSS permite rolar dentro de um
  alvo de snap maior que a viewport, e o `wheel-step` só troca de seção quando a borda da seção
  atual já está visível.
- ⚠️ Os rótulos das estações fora de foco são escondidos por classe CSS (`muted-by-stage`), não por
  `visible`. As estações também mexem em `visible` dos próprios objetos, e as duas coisas brigariam.

## Rótulos ilustrativos

Nas cenas, algumas coisas são ilustração e não vêm do LinkedIn nem do Lucas. "Tribunais", "Diários oficiais"
e "Documentos" como produtores, os nomes de tópico (`processos.brutos`, `processos.normalizados` etc.)
e a ordem exata das etapas no pipeline do Kafka, o centro de distribuição, os caminhões e as
regiões de entrega da cena do Magalu, as etapas intermediárias do pipeline de emissão da Porto
(análise de risco e cálculo do prêmio), os números de proposta e apólice, os valores de prêmio e os
trechos de código no terminal da Porto são exemplos genéricos. Na cena de Trust & Privacy, a petição é ficção: a Criatura processa o Dr. Victor Frankenstein
por pensão alimentícia (personagens de Mary Shelley, em domínio público). Os CPFs têm dígito
verificador inválido de propósito, para nunca coincidirem com um CPF real; mantenha assim se trocar os
números. A divisão da cascata (60% sem dado pessoal, 34% NER, 6% LLM) também é ilustrativa. Nas vinhetas
de LLM, também são ilustrativos: os nomes de etapa, ferramenta e tópico (`extrair_decisao`,
`buscar_processo`, `decisoes.estruturadas`), os campos do JSON, a issue, o diff e o PR. Elas continuam o
caso Frankenstein. Na cena de Kubernetes, os nomes de namespace, pod, job e CronJob, as versões e as
taxas de erro do canário são ilustrativos. Já as práticas mostradas (escala por lag, deploy gradual,
canário com rollback, jobs pontuais e agendados, réplicas em duas zonas) foram confirmadas pelo Lucas. Que a Porto tinha pipelines da proposta
até a emissão da apólice veio do próprio Lucas, não do LinkedIn. Não descrevem sistemas reais das empresas. Mantenha assim:
o currículo não deve sugerir detalhes internos que não estão no perfil.
