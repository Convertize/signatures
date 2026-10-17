# Gerador de assinaturas de e-mail Convertize — Design

Data: 2026-10-17

## Objetivo

Aplicação 100% estática, sem backend, que gera a assinatura de e-mail de um colaborador a partir de temas versionados (`v1/`, `v2/`, `v3/`, `vN/`). Dois modos de uso:

1. **Gerador** (página no GitHub Pages): formulário, preview em tempo real, botões de copiar e tutorial do Gmail. Aceita todos os parâmetros por URL para abrir já preenchido.
2. **Biblioteca/embed** (módulo ES servido pelo jsDelivr): o console interno da Convertize chama `renderSignature(params)` ou usa a tag `<convertize-signature>` para mostrar a assinatura e um botão de copiar, sem iframe e sem servidor.

Imagens e temas são servidos pelo jsDelivr a partir do repositório público do GitHub. A interface do gerador fica no GitHub Pages porque o jsDelivr entrega `.html` como texto puro.

## Decisões já tomadas com o usuário

- Telefones fixos RP e SP continuam aparecendo em todo tema. `ramal` é acrescentado a eles ("Ramal 201"). `celular` é opcional, em linha própria, só aparece se preenchido.
- Campo `email` opcional; aparece nos temas que têm lugar para ele.
- Endereço único (flag liga/desliga): Rua Maestro Joaquim Rangel, 795 / Alto da Boa Vista, Ribeirão Preto - SP | 14025-610.
- Disclaimer (flag liga/desliga) com o texto PT ("AVISO LEGAL") e EN ("DISCLAIMER") fornecidos pelo usuário, nessa ordem, abaixo da assinatura.
- `cargo` presente = aparece; ausente = escondido. Na interface há um checkbox "Mostrar cargo" que apenas controla se o valor é enviado.
- Sem build, sem dependências de runtime. Implementação delegada a modelos mais baratos.

## Estrutura do repositório

```
index.html          gerador: formulário + preview + tutorial
app.js              liga formulário, URL, preview e botões (usa lib/signature.js)
styles.css          estilo do gerador (nunca da assinatura)
config.js           CDN_BASE (jsDelivr) + dados fixos da empresa
themes.json         [{ "id": "v1", "label": "Clássico" }, ...]
lib/template.js     engine de template (função pura)
lib/params.js       parse/serialização de parâmetros (função pura)
lib/signature.js    API pública: renderSignature, listThemes, copySignature,
                    paramsFromUrl + custom element <convertize-signature>
v1/ v2/ v3/         theme.html + PNGs
tests/*.test.js     node --test, sem dependências
package.json        só "scripts": { "test": "node --test tests/" }
README.md           uso do gerador, da URL, da biblioteca, deploy e cache
```

## config.js

```js
export const CDN_BASE = 'https://cdn.jsdelivr.net/gh/OWNER/REPO@main'; // preencher
export const empresa = {
  site: 'https://www.convertize.com.br/',
  siteLabel: 'www.convertize.com.br',
  telefoneRP: '+55 (16) 3075.7676',
  telefoneSP: '+55 (11) 4010.7676',
  endereco: { linha1: 'Rua Maestro Joaquim Rangel, 795', linha2: 'Alto da Boa Vista, Ribeirão Preto - SP | 14025-610' },
  redes: { facebook: 'https://www.facebook.com/convertize', twitter: 'https://twitter.com/convertizeon', linkedin: 'https://www.linkedin.com/company/convertize-e-commerce' },
  disclaimer: { tituloPT: 'AVISO LEGAL', textoPT: '“As informações existentes...”', tituloEN: 'DISCLAIMER', textoEN: '“This email and its attachments...”' },
};
```

## Engine de template (`lib/template.js`)

`render(template, context) -> string`. Sintaxe mínima, inspirada em Mustache:

- `{{chave}}` e `{{obj.chave}}`: substitui pelo valor, com escape de HTML (`& < > " '`). Valor ausente, `null` ou `undefined` vira string vazia.
- `{{#chave}}...{{/chave}}`: renderiza o miolo uma vez se o valor for truthy (string não vazia, `true`, objeto). Não itera arrays (não há necessidade). Blocos podem aninhar e usar chaves aninhadas.
- Nenhuma saída sem escape (não existe `{{{ }}}`). Quebras de linha do endereço e do disclaimer são resolvidas pela estrutura do template, não por HTML no dado.
- Fora dessas duas construções, o texto passa intocado.

## Contexto de renderização

Montado em `lib/signature.js` a partir dos parâmetros normalizados:

```
nome, cargo, email, celular, ramal   strings (trim; vazio = ausente)
endereco                             objeto empresa.endereco ou null
disclaimer                           objeto empresa.disclaimer ou null
empresa                              objeto completo de config.js
cdn                                  CDN_BASE
```

## Parâmetros (`lib/params.js`)

Mesmos nomes na URL, na função e na tag:

| nome | tipo | observação |
|---|---|---|
| `theme` | string | id do tema; padrão `v1` |
| `nome` | string | obrigatório para renderizar; sem ele o preview mostra placeholder "Seu nome" |
| `cargo`, `email`, `celular`, `ramal` | string | opcionais |
| `endereco`, `disclaimer` | boolean | aceitam `1`, `true`, `sim`; qualquer outra coisa é `false` |

- `parseParams(input)`: aceita `URLSearchParams`, objeto simples ou atributos de elemento; faz trim, normaliza booleanos, descarta chaves desconhecidas; retorna objeto completo com defaults.
- `toSearchParams(params)`: inverso, omitindo vazios e `false`, para o gerador manter a URL da barra sincronizada via `history.replaceState`.

## Biblioteca (`lib/signature.js`)

```js
export async function listThemes({ baseUrl } = {})            // lê themes.json
export async function renderSignature(params, { baseUrl } = {}) // -> string HTML
export async function copySignature(html)                        // clipboard rich text
export function paramsFromUrl(url = location.href)               // -> params
```

- `baseUrl` padrão = `CDN_BASE`; o gerador passa `'./'` para ler temas locais. Templates são cacheados em memória por `baseUrl + theme`.
- Tema inexistente lança `Error('Tema desconhecido: v9')`. Falha de rede propaga o erro; quem chama decide o que mostrar.
- `copySignature`: tenta `navigator.clipboard.write` com `ClipboardItem` contendo `text/html` e `text/plain` (texto derivado do HTML sem tags). Se indisponível ou falhar, cai em `execCommand('copy')` sobre um nó temporário com o HTML selecionado. Se ambos falharem, lança erro.
- Custom element `<convertize-signature>`: atributos = parâmetros; atributos booleanos por presença (`endereco disclaimer`); atributo opcional `botao-copiar` acrescenta um botão "Copiar assinatura" abaixo, que usa `copySignature` e mostra "Copiado!" ou a mensagem de erro por 2 s. Renderiza no light DOM (a assinatura só usa estilos inline, então não precisa de shadow DOM, e assim o console pode estilizar o botão). Re-renderiza quando um atributo observado muda.
- Ao carregar, também expõe `window.ConvertizeSignature = { renderSignature, listThemes, copySignature, paramsFromUrl }` para quem não usa `import`.

## Gerador (`index.html` + `app.js`)

- Layout em duas colunas no desktop, empilhado no celular. Esquerda: `<select>` de tema (populado por `listThemes`), campos nome, cargo (com checkbox "Mostrar cargo"), e-mail, celular, ramal, checkboxes "Mostrar endereço" e "Incluir disclaimer". Direita: cartão branco com o preview, dois botões e a seção recolhível do tutorial.
- Ao carregar: `paramsFromUrl` preenche o formulário e renderiza. A cada `input`/`change`: recalcula params, atualiza a URL (`replaceState`) e re-renderiza o preview. Sem debounce.
- Se o template do tema escolhido não contém `{{#endereco}}` / `{{#disclaimer}}` / `{{#cargo}}`, o checkbox correspondente fica desabilitado com title "Este tema não tem este bloco". (Detecção por busca de string no template; `signature.js` expõe `getThemeTemplate(theme, { baseUrl })` para isso.)
- Botão **Copiar para o Gmail**: `copySignature(html)`. Botão **Copiar código HTML**: `navigator.clipboard.writeText(html)` com o mesmo fallback. Ambos mostram "Copiado!" por 2 s, ou a mensagem de erro em vermelho.
- Tutorial "Como configurar no Gmail" (`<details>`): 1) Clique em Copiar para o Gmail. 2) No Gmail, engrenagem > Ver todas as configurações. 3) Aba Geral, seção Assinatura, Criar nova, dê um nome. 4) Clique na caixa de edição e cole (Ctrl+V ou Cmd+V). 5) Em "Padrões de assinatura", escolha essa assinatura para novos e-mails e respostas. 6) Role até o fim e clique em Salvar alterações. Nota: as imagens vêm do CDN; se não aparecerem na hora, envie um e-mail de teste para si mesmo.
- Erros de carregamento (themes.json ou tema) aparecem no lugar do preview, com a mensagem do erro.

## Temas

Os três temas existentes são limpos (removido lixo do Gmail: divs aninhadas, `<br class="m_...">`, `data-saferedirecturl`) e parametrizados. Todos passam a ter os blocos `{{#cargo}}`, `{{#ramal}}`, `{{#celular}}`, `{{#email}}`, `{{#endereco}}`, `{{#disclaimer}}`, cada um com o estilo do tema. Imagens usam `{{cdn}}/vN/arquivo.png`. Regras visuais:

- **v1** (Clássico, 530px, Arial, azul `#0b0d5d` e laranja `#fc5830`): mantém a estrutura atual. Ramal entra na mesma linha dos fixos ("RP ... - SP ... - Ramal 201"). Celular e e-mail em linha abaixo, mesmo estilo. Endereço e redes no bloco já existente. Disclaimer após a tabela: título em caixa alta cinza (`#8b9194`, 11px) e parágrafo cinza (`#8b9194`, 11px, line-height 16px), separado por linha `#ffe4db`, largura 530px.
- **v2** (Claro, 568px, fundo `#fafafa`): ramal junto dos fixos; celular, e-mail e endereço como linhas adicionais em 13px `#333333`; disclaimer abaixo da tabela em 11px `#777777`.
- **v3** (Escuro, 576px, fundo `#2f3542`): ramal e celular na linha de telefones; e-mail já existe (ganha `mailto:`); endereço como linha extra em 11px `#8b9194`; disclaimer abaixo da tabela em 11px `#8b9194`.

`themes.json`: `[{"id":"v1","label":"Clássico"},{"id":"v2","label":"Claro"},{"id":"v3","label":"Escuro"}]`. Adicionar tema = criar `vN/theme.html` + imagens e uma linha aqui.

## Testes (`node --test tests/`)

- `template.test.js`: substituição simples, chave aninhada, escape de HTML, chave ausente vira vazio, bloco truthy renderiza, bloco falsy some, blocos aninhados, texto fora das tags intocado.
- `params.test.js`: parse de `URLSearchParams` e objeto, booleanos (`1`/`true`/`sim`/ausente/`0`), trim, defaults, chaves desconhecidas ignoradas, `toSearchParams` omite vazios e faz round-trip.
- `signature.test.js`: `renderSignature` com `fetch` injetado (opção `fetch` nas funções) usando um template de teste: campos aparecem, blocos somem quando flag off, `cdn` substituído, tema desconhecido lança erro.
- Verificação manual no navegador (Chrome) ao final: abrir `index.html` via servidor local, preencher, copiar, colar no Gmail.

## Deploy

1. Repositório público no GitHub; Pages servindo a raiz da branch `main`.
2. Preencher `CDN_BASE` em `config.js` com `https://cdn.jsdelivr.net/gh/OWNER/REPO@main`.
3. README documenta: cache de ~12 h do `@main`, URL de purge (`https://purge.jsdelivr.net/gh/OWNER/REPO@main/caminho`), recomendação de pinar tag (`@v1.0.0`) no console.

## Fora do escopo

Persistência em localStorage, tutorial de Outlook, shadow DOM, i18n da interface, iteração de arrays na engine, saída sem escape.
