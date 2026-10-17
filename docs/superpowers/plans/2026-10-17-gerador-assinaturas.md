# Gerador de Assinaturas Convertize — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página estática + biblioteca JS no jsDelivr que geram a assinatura de e-mail Convertize a partir de temas `vN/theme.html`, com preview ao vivo, parâmetros por URL, cópia para o Gmail e embed `<convertize-signature>`.

**Architecture:** Tudo roda no navegador. Uma engine de template de 60 linhas (`{{chave}}`, `{{#bloco}}...{{/bloco}}`) renderiza os temas com um contexto montado de parâmetros normalizados + dados fixos da empresa. `lib/signature.js` é o ponto de entrada público (API + custom element); `index.html`/`app.js` é o gerador que usa a mesma biblioteca. Sem build, sem dependências.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node 22 (`node:test`) só para testes. Hospedagem: GitHub Pages (interface) + jsDelivr (biblioteca, temas, imagens).

**Spec:** `docs/superpowers/specs/2026-10-17-gerador-assinaturas-design.md`

## Global Constraints

- Zero dependências de runtime e zero passo de build. `package.json` só tem `scripts.test`.
- Todos os arquivos JS são ES modules (`"type": "module"`); imports relativos com extensão `.js`.
- Toda saída da engine é escapada contra HTML. Não existe saída crua.
- Nomes de parâmetro idênticos em URL, função e tag: `theme, nome, cargo, email, celular, ramal, endereco, disclaimer`. Booleanos aceitam `1`, `true`, `sim` (case-insensitive).
- Tema padrão `v1`. Id de tema só com `[a-z0-9_-]` e precisa existir em `themes.json`.
- `{{cdn}}` nas imagens dos temas = `CDN_BASE` de `config.js` (`https://cdn.jsdelivr.net/gh/OWNER/REPO@main`, OWNER/REPO preenchidos pelo usuário depois).
- Textos da interface em português do Brasil. Mensagens de erro em português, começando com maiúscula, sem ponto final.
- Commits com mensagem em inglês no imperativo, terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Use `git -c user.name="Gabriel Galiaso" -c user.email="gabriel@convertize.com.br" commit ...` se o git local não tiver identidade configurada.
- Rodar `npm test` antes de cada commit; só commitar com tudo verde.

## Review Focus

1. Nome com `&`, `<`, aspas ou acentos ("Gabriel & Cia <teste>") deve aparecer literalmente na assinatura, nunca virar HTML. Teste em `tests/core.test.js` (Task 3).
2. `theme=../../x` ou `theme=v9` deve falhar com "Tema desconhecido" e nunca disparar fetch para esse caminho. Teste em `tests/core.test.js` (Task 3).
3. Booleanos em caixa alta (`TRUE`, `Sim`) e cargo só com espaços: o primeiro liga, o segundo esconde o bloco. Testes em `tests/params.test.js` (Task 2) e `tests/template.test.js` (Task 1).
4. `themes.json` ou `theme.html` respondendo 404: a promise rejeita com mensagem contendo a URL e o status, e o gerador mostra isso no lugar do preview. Teste em `tests/core.test.js` (Task 3); verificação manual na Task 5.
5. Digitação rápida no gerador: a resposta de um render antigo não pode sobrescrever um mais novo. Token de sequência em `app.js` e `element.js` (Tasks 4 e 5); verificação manual.

---

### Task 1: Scaffold + engine de template

**Files:**
- Create: `package.json`, `.nojekyll`
- Create: `lib/template.js`
- Test: `tests/template.test.js`

**Interfaces:**
- Produces: `render(template: string, context: object): string`, `escapeHtml(value): string`, `lookup(context, path: string): any`. `render` lança `Error('Bloco não fechado: <chave>')` e `Error('Fechamento inesperado: <chave>')`.

- [ ] **Step 1: Criar `package.json` e `.nojekyll`**

```json
{
  "name": "convertize-signatures",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

```bash
cd /Users/gabrielgaliaso/Projects/convertize-signatures && touch .nojekyll
```

- [ ] **Step 2: Escrever o teste da engine**

`tests/template.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, escapeHtml, lookup } from '../lib/template.js';

test('substitui variável simples', () => {
  assert.equal(render('Olá, {{nome}}!', { nome: 'Ana' }), 'Olá, Ana!');
});

test('substitui chave aninhada', () => {
  assert.equal(render('{{empresa.site}}', { empresa: { site: 'x.com' } }), 'x.com');
});

test('escapa HTML', () => {
  assert.equal(render('{{nome}}', { nome: '<b>&"\'' }), '&lt;b&gt;&amp;&quot;&#39;');
  assert.equal(escapeHtml('a<b'), 'a&lt;b');
});

test('chave ausente, null ou undefined vira vazio', () => {
  assert.equal(render('[{{nada}}][{{a.b}}][{{c}}]', { a: null, c: undefined }), '[][][]');
});

test('lookup resolve caminhos e tolera intermediários nulos', () => {
  assert.equal(lookup({ a: { b: 1 } }, 'a.b'), 1);
  assert.equal(lookup({ a: null }, 'a.b'), undefined);
  assert.equal(lookup({}, 'x'), undefined);
});

test('bloco truthy renderiza o miolo', () => {
  assert.equal(render('{{#cargo}}| {{cargo}}{{/cargo}}', { cargo: 'CEO' }), '| CEO');
});

test('bloco falsy some', () => {
  assert.equal(render('a{{#cargo}}| {{cargo}}{{/cargo}}b', { cargo: '' }), 'ab');
  assert.equal(render('a{{#x}}y{{/x}}b', { x: false }), 'ab');
  assert.equal(render('a{{#x}}y{{/x}}b', { x: null }), 'ab');
  assert.equal(render('a{{#x}}y{{/x}}b', {}), 'ab');
});

test('string só com espaços conta como falsy', () => {
  assert.equal(render('a{{#cargo}}X{{/cargo}}b', { cargo: '   ' }), 'ab');
});

test('objeto conta como truthy', () => {
  assert.equal(
    render('{{#endereco}}{{endereco.linha1}}{{/endereco}}', { endereco: { linha1: 'Rua X' } }),
    'Rua X',
  );
});

test('blocos aninhados', () => {
  const tpl = '{{#a}}A{{#b}}B{{/b}}{{/a}}';
  assert.equal(render(tpl, { a: true, b: true }), 'AB');
  assert.equal(render(tpl, { a: true, b: false }), 'A');
  assert.equal(render(tpl, { a: false, b: true }), '');
});

test('texto fora das tags passa intocado', () => {
  const tpl = '<td style="color:#fff">{ } }} {{nome}}</td>';
  assert.equal(render(tpl, { nome: 'Ana' }), '<td style="color:#fff">{ } }} Ana</td>');
});

test('espaços dentro das chaves são tolerados', () => {
  assert.equal(render('{{ nome }}{{# x }}!{{/ x }}', { nome: 'Ana', x: true }), 'Ana!');
});

test('valor com sintaxe de template não é reprocessado', () => {
  assert.equal(render('{{nome}}', { nome: '{{cargo}}', cargo: 'CEO' }), '{{cargo}}');
});

test('bloco sem fechamento lança erro', () => {
  assert.throws(() => render('{{#a}}x', { a: true }), /Bloco não fechado: a/);
});

test('fechamento sem abertura lança erro', () => {
  assert.throws(() => render('x{{/a}}', {}), /Fechamento inesperado: a/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test`
Expected: falha com `Cannot find module '.../lib/template.js'`.

- [ ] **Step 4: Implementar `lib/template.js`**

```js
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function lookup(context, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), context);
}

function isTruthy(value) {
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findClosing(template, from, key) {
  const re = new RegExp(`\\{\\{\\s*/\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
  re.lastIndex = from;
  const match = re.exec(template);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

export function render(template, context = {}) {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('{{', i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    const close = template.indexOf('}}', open + 2);
    if (close === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const tag = template.slice(open + 2, close).trim();

    if (tag.startsWith('#')) {
      const key = tag.slice(1).trim();
      const closing = findClosing(template, close + 2, key);
      if (!closing) throw new Error(`Bloco não fechado: ${key}`);
      if (isTruthy(lookup(context, key))) {
        out += render(template.slice(close + 2, closing.start), context);
      }
      i = closing.end;
    } else if (tag.startsWith('/')) {
      throw new Error(`Fechamento inesperado: ${tag.slice(1).trim()}`);
    } else {
      const value = lookup(context, tag);
      out += value == null ? '' : escapeHtml(value);
      i = close + 2;
    }
  }
  return out;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: 16 testes, todos `ok`.

- [ ] **Step 6: Commit**

```bash
git add package.json .nojekyll lib/template.js tests/template.test.js
git commit -m "Add template engine with escaped variables and conditional blocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Normalização de parâmetros

**Files:**
- Create: `lib/params.js`
- Test: `tests/params.test.js`

**Interfaces:**
- Produces: `parseParams(input?: URLSearchParams | object): Params`, `toSearchParams(params: Params): URLSearchParams`, `parseBool(value): boolean`, constantes `DEFAULT_THEME = 'v1'`, `STRING_KEYS`, `BOOL_KEYS`.
- `Params = { theme: string, nome: string, cargo: string, email: string, celular: string, ramal: string, endereco: boolean, disclaimer: boolean }` sempre com todas as chaves.

- [ ] **Step 1: Escrever o teste**

`tests/params.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, toSearchParams, parseBool, DEFAULT_THEME } from '../lib/params.js';

const VAZIO = { theme: 'v1', nome: '', cargo: '', email: '', celular: '', ramal: '', endereco: false, disclaimer: false };

test('sem entrada devolve defaults', () => {
  assert.deepEqual(parseParams(), VAZIO);
  assert.deepEqual(parseParams({}), VAZIO);
  assert.equal(DEFAULT_THEME, 'v1');
});

test('lê URLSearchParams com trim e booleanos', () => {
  const sp = new URLSearchParams('?theme=v2&nome=+Ana+Souza+&cargo=CEO&endereco=1&disclaimer=sim');
  assert.deepEqual(parseParams(sp), {
    theme: 'v2', nome: 'Ana Souza', cargo: 'CEO', email: '', celular: '', ramal: '',
    endereco: true, disclaimer: true,
  });
});

test('lê objeto simples com booleanos reais e strings', () => {
  const p = parseParams({ nome: 'Ana', endereco: true, disclaimer: 'false', ramal: 201 });
  assert.equal(p.endereco, true);
  assert.equal(p.disclaimer, false);
  assert.equal(p.ramal, '201');
});

test('parseBool aceita 1, true e sim em qualquer caixa', () => {
  for (const v of ['1', 'true', 'TRUE', 'sim', 'Sim', ' SIM ', true]) assert.equal(parseBool(v), true, String(v));
  for (const v of ['0', 'false', 'nao', '', null, undefined, false, 'yes']) assert.equal(parseBool(v), false, String(v));
});

test('theme vazio ou só espaços cai no default', () => {
  assert.equal(parseParams({ theme: '  ' }).theme, 'v1');
});

test('chaves desconhecidas são ignoradas', () => {
  const p = parseParams({ nome: 'Ana', foo: 'bar', 'botao-copiar': '' });
  assert.equal('foo' in p, false);
  assert.equal('botao-copiar' in p, false);
});

test('toSearchParams omite vazios e false, sempre inclui theme', () => {
  assert.equal(toSearchParams(parseParams({ nome: 'Ana' })).toString(), 'theme=v1&nome=Ana');
  assert.equal(
    toSearchParams(parseParams({ theme: 'v3', nome: 'Ana', ramal: ' 201 ', endereco: true })).toString(),
    'theme=v3&nome=Ana&ramal=201&endereco=1',
  );
});

test('round-trip URL -> params -> URL -> params', () => {
  const original = parseParams({ theme: 'v2', nome: 'Ana & Cia', cargo: 'CEO', email: 'a@b.c', celular: '+55 16 9', ramal: '7', endereco: true, disclaimer: true });
  const volta = parseParams(new URLSearchParams(toSearchParams(original).toString()));
  assert.deepEqual(volta, original);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: `tests/params.test.js` falha com `Cannot find module '.../lib/params.js'`; template continua verde.

- [ ] **Step 3: Implementar `lib/params.js`**

```js
export const DEFAULT_THEME = 'v1';
export const STRING_KEYS = ['nome', 'cargo', 'email', 'celular', 'ramal'];
export const BOOL_KEYS = ['endereco', 'disclaimer'];

const TRUE_VALUES = new Set(['1', 'true', 'sim']);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function parseBool(value) {
  if (value === true) return true;
  if (value == null || value === false) return false;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

export function parseParams(input = {}) {
  const raw = input instanceof URLSearchParams ? Object.fromEntries(input) : input;
  const params = { theme: clean(raw.theme) || DEFAULT_THEME };
  for (const key of STRING_KEYS) params[key] = clean(raw[key]);
  for (const key of BOOL_KEYS) params[key] = parseBool(raw[key]);
  return params;
}

export function toSearchParams(params) {
  const p = parseParams(params);
  const sp = new URLSearchParams();
  sp.set('theme', p.theme);
  for (const key of STRING_KEYS) if (p[key]) sp.set(key, p[key]);
  for (const key of BOOL_KEYS) if (p[key]) sp.set(key, '1');
  return sp;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: todos `ok` (16 + 8).

- [ ] **Step 5: Commit**

```bash
git add lib/params.js tests/params.test.js
git commit -m "Add parameter parsing shared by URL, API and custom element

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Config da empresa + núcleo da biblioteca

**Files:**
- Create: `config.js`, `themes.json`
- Create: `lib/core.js`
- Test: `tests/core.test.js`

**Interfaces:**
- Consumes: `render` (Task 1), `parseParams` (Task 2).
- Produces (de `lib/core.js`):
  - `listThemes(options?): Promise<Array<{id, label}>>`
  - `getThemeTemplate(theme: string, options?): Promise<string>`
  - `buildContext(params, { cdn? }): object`
  - `renderSignature(params, options?): Promise<string>`
  - `paramsFromUrl(url?: string): Params`
  - `htmlToText(html: string): string`
  - `options = { baseUrl?: string (default CDN_BASE), fetch?: Function (default globalThis.fetch), cdn?: string (default CDN_BASE) }`
- Produces (de `config.js`): `CDN_BASE: string`, `empresa: { site, siteLabel, telefoneRP, telefoneSP, endereco: {linha1, linha2}, redes: {facebook, twitter, linkedin}, disclaimer: {tituloPT, textoPT, tituloEN, textoEN} }`.

- [ ] **Step 1: Criar `config.js`**

```js
// Preencher com o repositório público do GitHub, ex.: https://cdn.jsdelivr.net/gh/convertize/signatures@main
export const CDN_BASE = 'https://cdn.jsdelivr.net/gh/OWNER/REPO@main';

export const empresa = {
  site: 'https://www.convertize.com.br/',
  siteLabel: 'www.convertize.com.br',
  telefoneRP: '+55 (16) 3075.7676',
  telefoneSP: '+55 (11) 4010.7676',
  endereco: {
    linha1: 'Rua Maestro Joaquim Rangel, 795',
    linha2: 'Alto da Boa Vista, Ribeirão Preto - SP | 14025-610',
  },
  redes: {
    facebook: 'https://www.facebook.com/convertize',
    twitter: 'https://twitter.com/convertizeon',
    linkedin: 'https://www.linkedin.com/company/convertize-e-commerce',
  },
  disclaimer: {
    tituloPT: 'AVISO LEGAL',
    textoPT:
      '“As informações existentes nesta mensagem e nos arquivos anexados têm caráter confidencial e são para uso restrito. A utilização, divulgação, cópia ou distribuição desta mensagem, ou parte dela, por qualquer pessoa diferente do destinatário é proibida, sujeitando o infrator às sanções legais. Se esta mensagem foi recebida por engano, favor excluí-la e informar ao remetente pelo endereço eletrônico acima. Agradecemos sua cooperação.”',
    tituloEN: 'DISCLAIMER',
    textoEN:
      '“This email and its attachments may contain privileged and/or confidential information. Use, disclosure, copying or distribution of this message, or part thereof, by anyone other than the intended recipient is strictly prohibited, and will submit the infractor to the legal sanctions. If you have received this email in error, please notify the sender by reply email and destroy all copies of this message. Thank you for your cooperation.”',
  },
};
```

- [ ] **Step 2: Criar `themes.json`**

```json
[
  { "id": "v1", "label": "Clássico" },
  { "id": "v2", "label": "Claro" },
  { "id": "v3", "label": "Escuro" }
]
```

- [ ] **Step 3: Escrever o teste do núcleo**

`tests/core.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderSignature, listThemes, getThemeTemplate, buildContext, paramsFromUrl, htmlToText,
} from '../lib/core.js';
import { CDN_BASE, empresa } from '../config.js';

const TEMPLATE = [
  '<p>{{nome}}{{#cargo}} | {{cargo}}{{/cargo}}</p>',
  '{{#ramal}}<i>Ramal {{ramal}}</i>{{/ramal}}',
  '{{#endereco}}<u>{{endereco.linha1}}</u>{{/endereco}}',
  '{{#disclaimer}}<s>{{disclaimer.tituloPT}}</s>{{/disclaimer}}',
  '<img src="{{cdn}}/vt/logo.png">',
].join('');

function fakeFetch(files, calls = []) {
  return async (url) => {
    calls.push(url);
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

// cada teste usa um baseUrl próprio porque o cache da lib é por baseUrl
function setup(name) {
  const baseUrl = `https://cdn.test/${name}`;
  const calls = [];
  const files = {
    [`${baseUrl}/themes.json`]: JSON.stringify([{ id: 'vt', label: 'Teste' }]),
    [`${baseUrl}/vt/theme.html`]: TEMPLATE,
  };
  return { baseUrl, calls, fetch: fakeFetch(files, calls), files };
}

test('listThemes devolve o manifesto', async () => {
  const { baseUrl, fetch } = setup('list');
  assert.deepEqual(await listThemes({ baseUrl, fetch }), [{ id: 'vt', label: 'Teste' }]);
});

test('renderSignature com tudo preenchido', async () => {
  const { baseUrl, fetch } = setup('full');
  const html = await renderSignature(
    { theme: 'vt', nome: 'Ana', cargo: 'CEO', ramal: '201', endereco: '1', disclaimer: 'sim' },
    { baseUrl, fetch },
  );
  assert.ok(html.includes('<p>Ana | CEO</p>'));
  assert.ok(html.includes('Ramal 201'));
  assert.ok(html.includes(empresa.endereco.linha1));
  assert.ok(html.includes('AVISO LEGAL'));
  assert.ok(html.includes(`${CDN_BASE}/vt/logo.png`));
});

test('flags desligadas escondem os blocos', async () => {
  const { baseUrl, fetch } = setup('min');
  const html = await renderSignature({ theme: 'vt', nome: 'Ana' }, { baseUrl, fetch });
  assert.equal(html, `<p>Ana</p><img src="${CDN_BASE}/vt/logo.png">`);
});

test('escapa HTML vindo do usuário', async () => {
  const { baseUrl, fetch } = setup('esc');
  const html = await renderSignature({ theme: 'vt', nome: 'Gabriel & Cia <teste>' }, { baseUrl, fetch });
  assert.ok(html.includes('Gabriel &amp; Cia &lt;teste&gt;'));
  assert.ok(!html.includes('<teste>'));
});

test('opção cdn substitui o prefixo das imagens', async () => {
  const { baseUrl, fetch } = setup('cdn');
  const html = await renderSignature({ theme: 'vt', nome: 'Ana' }, { baseUrl, fetch, cdn: 'https://img.test' });
  assert.ok(html.includes('https://img.test/vt/logo.png'));
});

test('tema desconhecido ou com caminho relativo falha sem buscar o arquivo', async () => {
  const { baseUrl, fetch, calls } = setup('unknown');
  await assert.rejects(renderSignature({ theme: 'v9', nome: 'Ana' }, { baseUrl, fetch }), /Tema desconhecido: v9/);
  await assert.rejects(getThemeTemplate('../x', { baseUrl, fetch }), /Tema desconhecido: \.\.\/x/);
  assert.ok(calls.every((url) => url.endsWith('/themes.json')), `fetch indevido: ${calls}`);
});

test('404 propaga erro com URL e status', async () => {
  const { baseUrl, fetch, files } = setup('404');
  delete files[`${baseUrl}/vt/theme.html`];
  await assert.rejects(
    renderSignature({ theme: 'vt', nome: 'Ana' }, { baseUrl, fetch }),
    new RegExp(`Falha ao carregar ${baseUrl}/vt/theme.html \\(HTTP 404\\)`),
  );
});

test('template é buscado uma vez por baseUrl+tema', async () => {
  const { baseUrl, fetch, calls } = setup('cache');
  await renderSignature({ theme: 'vt', nome: 'A' }, { baseUrl, fetch });
  await renderSignature({ theme: 'vt', nome: 'B' }, { baseUrl, fetch });
  assert.equal(calls.filter((u) => u.endsWith('/vt/theme.html')).length, 1);
  assert.equal(calls.filter((u) => u.endsWith('/themes.json')).length, 1);
});

test('buildContext monta endereco/disclaimer conforme flags', () => {
  const on = buildContext({ nome: 'Ana', endereco: true, disclaimer: true });
  assert.deepEqual(on.endereco, empresa.endereco);
  assert.deepEqual(on.disclaimer, empresa.disclaimer);
  assert.equal(on.cdn, CDN_BASE);
  assert.equal(on.empresa, empresa);
  const off = buildContext({ nome: 'Ana' });
  assert.equal(off.endereco, null);
  assert.equal(off.disclaimer, null);
  assert.equal(off.cargo, '');
});

test('paramsFromUrl lê a query string', () => {
  const p = paramsFromUrl('https://x.test/app/?nome=Ana+Souza&disclaimer=1&theme=v2');
  assert.equal(p.nome, 'Ana Souza');
  assert.equal(p.disclaimer, true);
  assert.equal(p.theme, 'v2');
  assert.equal(p.endereco, false);
});

test('htmlToText tira tags, converte br e entidades', () => {
  assert.equal(htmlToText('<td><b>Ana &amp; Cia</b><br>CEO</td><p>Rua&nbsp;X</p>'), 'Ana & Cia\nCEO\nRua X');
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test`
Expected: `tests/core.test.js` falha com `Cannot find module '.../lib/core.js'`.

- [ ] **Step 5: Implementar `lib/core.js`**

```js
import { render } from './template.js';
import { parseParams } from './params.js';
import { CDN_BASE, empresa } from '../config.js';

const THEME_ID = /^[a-z0-9_-]+$/i;
const manifestCache = new Map();
const templateCache = new Map();

function joinUrl(baseUrl, path) {
  return (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) + path;
}

async function fetchText(url, options) {
  const doFetch = options.fetch || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('Fetch não disponível neste ambiente');
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url} (HTTP ${res.status})`);
  return res.text();
}

function cached(cache, key, loader) {
  if (!cache.has(key)) {
    cache.set(
      key,
      loader().catch((err) => {
        cache.delete(key);
        throw err;
      }),
    );
  }
  return cache.get(key);
}

export async function listThemes(options = {}) {
  const { baseUrl = CDN_BASE } = options;
  return cached(manifestCache, baseUrl, async () => JSON.parse(await fetchText(joinUrl(baseUrl, 'themes.json'), options)));
}

export async function getThemeTemplate(theme, options = {}) {
  const { baseUrl = CDN_BASE } = options;
  const themes = await listThemes(options);
  if (!THEME_ID.test(theme) || !themes.some((t) => t.id === theme)) {
    throw new Error(`Tema desconhecido: ${theme}`);
  }
  return cached(templateCache, `${baseUrl}|${theme}`, () => fetchText(joinUrl(baseUrl, `${theme}/theme.html`), options));
}

export function buildContext(params, { cdn = CDN_BASE } = {}) {
  const p = parseParams(params);
  return {
    nome: p.nome,
    cargo: p.cargo,
    email: p.email,
    celular: p.celular,
    ramal: p.ramal,
    endereco: p.endereco ? empresa.endereco : null,
    disclaimer: p.disclaimer ? empresa.disclaimer : null,
    empresa,
    cdn,
  };
}

export async function renderSignature(params, options = {}) {
  const p = parseParams(params);
  const template = await getThemeTemplate(p.theme, options);
  return render(template, buildContext(p, options));
}

export function paramsFromUrl(url = globalThis.location?.href) {
  return parseParams(new URL(url).searchParams);
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: todos `ok` (16 + 8 + 11).

- [ ] **Step 7: Commit**

```bash
git add config.js themes.json lib/core.js tests/core.test.js
git commit -m "Add company config, theme manifest and signature rendering core

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Clipboard, custom element e ponto de entrada público

**Files:**
- Create: `lib/clipboard.js`, `lib/element.js`, `lib/signature.js`
- Create: `exemplos/embed.html`

**Interfaces:**
- Consumes: tudo de `lib/core.js` (Task 3).
- Produces: `copySignature(html): Promise<void>`, `copyText(text): Promise<void>` (ambas lançam `Error` com mensagem em português se nada funcionar); custom element `<convertize-signature>` com atributos `theme nome cargo email celular ramal endereco disclaimer botao-copiar base-url`; `lib/signature.js` reexporta `core.js` + `clipboard.js`, registra o elemento e define `window.ConvertizeSignature`.

Sem teste automatizado nesta task (tudo depende de DOM e clipboard). A verificação é manual no Step 5.

- [ ] **Step 1: Criar `lib/clipboard.js`**

```js
import { htmlToText } from './core.js';

const FALHA = 'Não foi possível copiar. Selecione a assinatura e use Ctrl+C ou Cmd+C';

function execCopy(node) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    selection.removeAllRanges();
  }
  return ok;
}

function offscreen(element) {
  element.style.position = 'fixed';
  element.style.left = '-9999px';
  element.style.top = '0';
  element.setAttribute('aria-hidden', 'true');
  document.body.appendChild(element);
  return element;
}

export async function copySignature(html) {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([htmlToText(html)], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      // cai no fallback por seleção
    }
  }
  const holder = offscreen(document.createElement('div'));
  holder.contentEditable = 'true';
  holder.innerHTML = html;
  let ok = false;
  try {
    ok = execCopy(holder);
  } finally {
    holder.remove();
  }
  if (!ok) throw new Error(FALHA);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // cai no fallback por textarea
    }
  }
  const area = offscreen(document.createElement('textarea'));
  area.value = text;
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    area.remove();
  }
  if (!ok) throw new Error(FALHA);
}
```

- [ ] **Step 2: Criar `lib/element.js`**

```js
import { renderSignature } from './core.js';
import { copySignature } from './clipboard.js';
import { STRING_KEYS, BOOL_KEYS } from './params.js';

const LABEL_COPIAR = 'Copiar assinatura';

function flash(button, message) {
  button.textContent = message;
  setTimeout(() => {
    button.textContent = LABEL_COPIAR;
  }, 2000);
}

export class ConvertizeSignatureElement extends HTMLElement {
  static get observedAttributes() {
    return ['theme', ...STRING_KEYS, ...BOOL_KEYS, 'botao-copiar', 'base-url'];
  }

  #seq = 0;

  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #params() {
    const raw = {};
    for (const key of ['theme', ...STRING_KEYS]) {
      if (this.hasAttribute(key)) raw[key] = this.getAttribute(key);
    }
    for (const key of BOOL_KEYS) {
      if (this.hasAttribute(key)) {
        const value = this.getAttribute(key);
        raw[key] = value === '' ? true : value;
      }
    }
    return raw;
  }

  async #render() {
    const seq = ++this.#seq;
    const options = {};
    if (this.hasAttribute('base-url')) options.baseUrl = this.getAttribute('base-url');
    try {
      const html = await renderSignature(this.#params(), options);
      if (seq !== this.#seq) return;
      this.replaceChildren();
      const box = document.createElement('div');
      box.className = 'convertize-signature__preview';
      box.innerHTML = html;
      this.appendChild(box);
      if (this.hasAttribute('botao-copiar')) this.appendChild(this.#button(html));
    } catch (err) {
      if (seq !== this.#seq) return;
      this.textContent = err.message;
    }
  }

  #button(html) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'convertize-signature__copy';
    button.textContent = LABEL_COPIAR;
    button.addEventListener('click', async () => {
      try {
        await copySignature(html);
        flash(button, 'Copiado!');
      } catch (err) {
        flash(button, err.message);
      }
    });
    return button;
  }
}

if (!customElements.get('convertize-signature')) {
  customElements.define('convertize-signature', ConvertizeSignatureElement);
}
```

- [ ] **Step 3: Criar `lib/signature.js` (entrada pública)**

```js
export * from './core.js';
export * from './clipboard.js';
import './element.js';
import * as core from './core.js';
import * as clipboard from './clipboard.js';

window.ConvertizeSignature = { ...core, ...clipboard };
```

- [ ] **Step 4: Criar `exemplos/embed.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Exemplo de embed</title>
  <!-- Em produção troque por: https://cdn.jsdelivr.net/gh/OWNER/REPO@main/lib/signature.js -->
  <script type="module" src="../lib/signature.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; background: #f4f5f7; }
    convertize-signature { display: block; background: #fff; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .convertize-signature__copy { margin-top: 12px; padding: 8px 14px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Embed via tag</h1>
  <convertize-signature base-url="../" theme="v1" nome="Gabriel Galiaso" cargo="CEO" ramal="201" endereco disclaimer botao-copiar></convertize-signature>

  <h1>Embed via API</h1>
  <div id="api"></div>
  <script type="module">
    import { renderSignature } from '../lib/signature.js';
    document.getElementById('api').innerHTML = await renderSignature(
      { theme: 'v3', nome: 'Gabriel Galiaso', cargo: 'CEO', email: 'gabriel@convertize.com.br', celular: '+55 (16) 99999-0000' },
      { baseUrl: '../' },
    );
  </script>
</body>
</html>
```

- [ ] **Step 5: Verificar manualmente no navegador**

Só é possível depois da Task 5 (temas parametrizados). Rode então:

```bash
cd /Users/gabrielgaliaso/Projects/convertize-signatures && python3 -m http.server 8765 >/dev/null 2>&1 &
```

Abra `http://localhost:8765/exemplos/embed.html` (com as ferramentas do Chrome DevTools MCP se disponíveis, senão peça ao usuário). Esperado: duas assinaturas renderizadas, sem erro no console, botão "Copiar assinatura" vira "Copiado!" ao clicar. Execute no console do navegador `document.querySelector('convertize-signature').setAttribute('theme','v2')` e confirme que re-renderiza com o tema claro.

- [ ] **Step 6: Rodar testes e commitar**

Run: `npm test` (Expected: tudo `ok`; nada novo testado aqui, só garante que nada quebrou).

```bash
git add lib/clipboard.js lib/element.js lib/signature.js exemplos/embed.html
git commit -m "Add clipboard helpers, <convertize-signature> element and public entry point

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Parametrizar os três temas

**Files:**
- Modify: `v1/theme.html`, `v2/theme.html`, `v3/theme.html` (substituir o conteúdo inteiro)
- Test: `tests/themes.test.js`

**Interfaces:**
- Consumes: `render` (Task 1), `buildContext` (Task 3), `themes.json` (Task 3).
- Produces: templates que usam só as chaves do contexto: `nome cargo email celular ramal cdn endereco.linha1 endereco.linha2 empresa.* disclaimer.*` e os blocos `{{#cargo}} {{#ramal}} {{#celular}} {{#email}} {{#endereco}} {{#disclaimer}}`.

- [ ] **Step 1: Escrever o teste dos temas**

`tests/themes.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { render } from '../lib/template.js';
import { buildContext } from '../lib/core.js';

const root = new URL('../', import.meta.url);
const themes = JSON.parse(await readFile(new URL('themes.json', root), 'utf8'));
const BLOCKS = ['cargo', 'ramal', 'celular', 'email', 'endereco', 'disclaimer'];
const FULL = {
  nome: 'Ana Souza', cargo: 'Desenvolvedora', email: 'ana@convertize.com.br',
  celular: '+55 (16) 99999-0000', ramal: '201', endereco: true, disclaimer: true,
};

assert.ok(themes.length >= 3, 'themes.json deve listar v1, v2 e v3');

for (const { id } of themes) {
  const template = await readFile(new URL(`${id}/theme.html`, root), 'utf8');

  test(`${id}: declara todos os blocos`, () => {
    for (const block of BLOCKS) assert.ok(template.includes(`{{#${block}}}`), `falta {{#${block}}}`);
  });

  test(`${id}: não usa imagens do domínio antigo nem lixo do Gmail`, () => {
    assert.ok(!template.includes('convertize.com.br/s/'));
    assert.ok(!template.includes('Apple-interchange-newline'));
    assert.ok(!template.includes('data-saferedirecturl'));
    assert.ok(template.includes(`{{cdn}}/${id}/logo.png`));
  });

  test(`${id}: completo renderiza todos os dados`, () => {
    const html = render(template, buildContext({ theme: id, ...FULL }, { cdn: 'https://cdn.test' }));
    const esperados = [
      'Ana Souza', 'Desenvolvedora', '201', '+55 (16) 99999-0000', 'mailto:ana@convertize.com.br',
      'Rua Maestro Joaquim Rangel, 795', '14025-610', 'AVISO LEGAL', 'DISCLAIMER',
      '+55 (16) 3075.7676', '+55 (11) 4010.7676', `https://cdn.test/${id}/logo.png`,
    ];
    for (const s of esperados) assert.ok(html.includes(s), `faltou "${s}"`);
    assert.ok(!html.includes('{{'), 'sobrou tag de template');
  });

  test(`${id}: só com nome esconde os blocos opcionais`, () => {
    const html = render(template, buildContext({ theme: id, nome: 'Ana Souza' }));
    for (const s of ['Desenvolvedora', 'Ramal', 'mailto:', 'Rua Maestro', 'AVISO LEGAL', 'DISCLAIMER']) {
      assert.ok(!html.includes(s), `não devia ter "${s}"`);
    }
    assert.ok(html.includes('Ana Souza'));
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: `tests/themes.test.js` falha em "declara todos os blocos" e "domínio antigo" para os três temas.

- [ ] **Step 3: Reescrever `v1/theme.html`**

```html
<table cellpadding="0" cellspacing="0" width="530" style="font-family:Arial,sans-serif;color:#0b0d5d;">
  <tbody>
    <tr>
      <td width="120" valign="top" rowspan="2">
        <a href="{{empresa.site}}" target="_blank"><img src="{{cdn}}/v1/logo.png" width="113" height="111" alt="Convertize" style="border:0;display:block;"></a>
      </td>
      <td width="20"><div style="width:20px;height:1px;">&nbsp;</div></td>
      <td width="390" height="20" valign="top">
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:20px;">
          <span style="color:#0b0d5d;"><strong>{{nome}}</strong></span>{{#cargo}}<span style="color:#fc5830;">&nbsp;|&nbsp; {{cargo}}</span>{{/cargo}}
        </div>
      </td>
    </tr>
    <tr>
      <td width="20"><div style="width:20px;height:1px;">&nbsp;</div></td>
      <td colspan="2" valign="top">
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#0b0d5d;line-height:20px;">
          <strong>RP: {{empresa.telefoneRP}}</strong>&nbsp;-&nbsp;<strong>SP: {{empresa.telefoneSP}}</strong>{{#ramal}}&nbsp;-&nbsp;<strong>Ramal {{ramal}}</strong>{{/ramal}}
          {{#celular}}<br><strong>Celular: {{celular}}</strong>{{/celular}}
          {{#email}}<br><a href="mailto:{{email}}" style="color:#0b0d5d;text-decoration:none;">{{email}}</a>{{/email}}
          <div style="border-top:1px solid #ffe4db;width:390px;margin-top:5px;padding-top:5px;">
            {{#endereco}}<span style="display:block;color:#323a45;margin-bottom:5px;">{{endereco.linha1}}<br>{{endereco.linha2}}</span>{{/endereco}}
            <a href="{{empresa.redes.facebook}}" style="text-decoration:none;font-size:0;" target="_blank"><img src="{{cdn}}/v1/facebook.png" width="6" height="12" alt="Facebook" style="border:0;padding-right:8px;"></a><a href="{{empresa.redes.twitter}}" style="text-decoration:none;font-size:0;" target="_blank"><img src="{{cdn}}/v1/twitter.png" width="15" height="12" alt="Twitter" style="border:0;padding-right:8px;"></a><a href="{{empresa.redes.linkedin}}" style="text-decoration:none;font-size:0;" target="_blank"><img src="{{cdn}}/v1/linkedin.png" width="13" height="12" alt="LinkedIn" style="border:0;"></a>
          </div>
        </div>
      </td>
    </tr>
  </tbody>
</table>
{{#disclaimer}}
<table cellpadding="0" cellspacing="0" width="530" style="font-family:Arial,sans-serif;margin-top:15px;border-top:1px solid #ffe4db;">
  <tbody>
    <tr>
      <td style="padding-top:12px;font-size:11px;line-height:16px;color:#8b9194;">
        <strong style="display:block;margin-bottom:4px;">{{disclaimer.tituloPT}}</strong>
        <span style="display:block;margin-bottom:12px;">{{disclaimer.textoPT}}</span>
        <strong style="display:block;margin-bottom:4px;">{{disclaimer.tituloEN}}</strong>
        <span style="display:block;">{{disclaimer.textoEN}}</span>
      </td>
    </tr>
  </tbody>
</table>
{{/disclaimer}}
```

- [ ] **Step 4: Reescrever `v2/theme.html`**

```html
<table cellpadding="0" cellspacing="0" width="568" bgcolor="#fafafa" style="font-family:Arial,sans-serif;">
  <tbody>
    <tr>
      <td width="205" valign="middle" rowspan="2">
        <a href="{{empresa.site}}" target="_blank"><img src="{{cdn}}/v2/logo.png" width="205" height="135" alt="Convertize" style="border:0;display:block;"></a>
      </td>
      <td width="20"><div style="width:20px;height:1px;">&nbsp;</div></td>
      <td width="343" valign="middle">
        <div style="font-size:20px;font-weight:600;color:#000000;">{{nome}}</div>
        {{#cargo}}<div style="font-size:14px;color:#d8643d;margin-top:3px;">{{cargo}}</div>{{/cargo}}
      </td>
    </tr>
    <tr>
      <td width="20"><div style="width:20px;height:1px;">&nbsp;</div></td>
      <td valign="middle">
        <div style="font-size:13px;color:#333333;line-height:20px;">
          <img src="{{cdn}}/v2/phone.png" width="10" height="10" alt="" style="border:0;padding-right:5px;"><strong>RP:</strong> {{empresa.telefoneRP}}&nbsp;&nbsp;&nbsp;<img src="{{cdn}}/v2/phone.png" width="10" height="10" alt="" style="border:0;padding-right:5px;"><strong>SP:</strong> {{empresa.telefoneSP}}{{#ramal}}&nbsp;&nbsp;&nbsp;<strong>Ramal:</strong> {{ramal}}{{/ramal}}
          {{#celular}}<br><strong>Celular:</strong> {{celular}}{{/celular}}
          {{#email}}<br><a href="mailto:{{email}}" style="color:#333333;text-decoration:none;">{{email}}</a>{{/email}}
          {{#endereco}}<br>{{endereco.linha1}}<br>{{endereco.linha2}}{{/endereco}}
        </div>
        <div style="font-size:15px;color:#333333;margin-top:5px;">
          <a href="{{empresa.site}}" target="_blank" style="color:#333333;text-decoration:none;">www.<strong>convertize</strong>.com.br</a>
        </div>
      </td>
    </tr>
  </tbody>
</table>
{{#disclaimer}}
<table cellpadding="0" cellspacing="0" width="568" style="font-family:Arial,sans-serif;margin-top:15px;">
  <tbody>
    <tr>
      <td style="font-size:11px;line-height:16px;color:#777777;">
        <strong style="display:block;margin-bottom:4px;">{{disclaimer.tituloPT}}</strong>
        <span style="display:block;margin-bottom:12px;">{{disclaimer.textoPT}}</span>
        <strong style="display:block;margin-bottom:4px;">{{disclaimer.tituloEN}}</strong>
        <span style="display:block;">{{disclaimer.textoEN}}</span>
      </td>
    </tr>
  </tbody>
</table>
{{/disclaimer}}
```

- [ ] **Step 5: Reescrever `v3/theme.html`**

```html
<table cellpadding="0" cellspacing="15" width="576" bgcolor="#2f3542" style="font-family:Arial,sans-serif;border-radius:5px;">
  <tbody>
    <tr>
      <td width="100" valign="middle" rowspan="3">
        <a href="{{empresa.site}}" target="_blank"><img src="{{cdn}}/v3/logo.png" width="100" height="100" alt="Convertize" style="border:0;display:block;"></a>
      </td>
      <td valign="middle">
        {{#cargo}}<div style="font-size:12px;color:#8b9194;">{{cargo}}</div>{{/cargo}}
        <div style="font-size:20px;color:#ffffff;">{{nome}}</div>
      </td>
      <td width="1" valign="middle" rowspan="3"><div style="width:1px;height:100px;background:#3e4450;"><span></span></div></td>
      <td width="120" valign="bottom" align="center" rowspan="3">
        <div><img src="{{cdn}}/v3/website.png" width="15" height="15" alt="" style="border:0;"></div>
        <div><a href="{{empresa.site}}" target="_blank" style="display:inline-block;margin-top:10px;border:2px solid #ffffff;padding:5px 10px;font-size:12px;text-decoration:none;color:#ffffff;border-radius:5px;">nosso site</a></div>
      </td>
    </tr>
    <tr>
      <td><div style="width:90%;height:1px;background:#3e4450;"><span></span></div></td>
    </tr>
    <tr>
      <td valign="middle">
        <div style="font-size:11px;color:#ffffff;line-height:16px;">
          <span style="margin-right:5px;"><img src="{{cdn}}/v3/phone.png" width="12" height="12" alt="" style="border:0;vertical-align:middle;"> RP {{empresa.telefoneRP}}</span>
          <span style="margin-right:5px;"><img src="{{cdn}}/v3/phone.png" width="12" height="12" alt="" style="border:0;vertical-align:middle;"> SP {{empresa.telefoneSP}}</span>
          {{#ramal}}<span>Ramal {{ramal}}</span>{{/ramal}}
          {{#celular}}<br><img src="{{cdn}}/v3/whatsapp.png" width="12" height="12" alt="" style="border:0;vertical-align:middle;"> {{celular}}{{/celular}}
        </div>
        {{#email}}<div style="margin-top:5px;font-size:11px;color:#ffffff;"><img src="{{cdn}}/v3/email.png" width="12" height="12" alt="" style="border:0;vertical-align:middle;"> <a href="mailto:{{email}}" style="font-size:11px;color:#ffffff;text-decoration:none;">{{email}}</a></div>{{/email}}
        {{#endereco}}<div style="margin-top:5px;font-size:11px;color:#8b9194;">{{endereco.linha1}}<br>{{endereco.linha2}}</div>{{/endereco}}
      </td>
    </tr>
  </tbody>
</table>
{{#disclaimer}}
<table cellpadding="0" cellspacing="0" width="576" style="font-family:Arial,sans-serif;margin-top:15px;">
  <tbody>
    <tr>
      <td style="font-size:11px;line-height:16px;color:#8b9194;">
        <strong style="display:block;margin-bottom:4px;">{{disclaimer.tituloPT}}</strong>
        <span style="display:block;margin-bottom:12px;">{{disclaimer.textoPT}}</span>
        <strong style="display:block;margin-bottom:4px;">{{disclaimer.tituloEN}}</strong>
        <span style="display:block;">{{disclaimer.textoEN}}</span>
      </td>
    </tr>
  </tbody>
</table>
{{/disclaimer}}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: todos `ok` (12 testes novos de temas).

- [ ] **Step 7: Executar a verificação manual pendente da Task 4 (Step 5)**

Agora os temas existem; siga o Step 5 da Task 4 e confirme as duas assinaturas no `exemplos/embed.html`.

- [ ] **Step 8: Commit**

```bash
git add v1/theme.html v2/theme.html v3/theme.html tests/themes.test.js
git commit -m "Parametrize v1, v2 and v3 themes with placeholders and optional blocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Página do gerador

**Files:**
- Create: `index.html`, `styles.css`, `app.js`

**Interfaces:**
- Consumes: `listThemes, getThemeTemplate, renderSignature, copySignature, copyText, paramsFromUrl` de `lib/signature.js`; `toSearchParams` de `lib/params.js`.
- Produces: página em `/` que lê e escreve a query string.

- [ ] **Step 1: Criar `index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Assinaturas Convertize</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="topo">
    <h1>Gerador de assinatura</h1>
    <p>Preencha, confira o preview e copie para o Gmail.</p>
  </header>
  <main class="layout">
    <form id="form" class="painel" autocomplete="off">
      <label>Tema
        <select name="theme" id="theme"></select>
      </label>
      <label>Nome
        <input name="nome" type="text" placeholder="Seu nome" required>
      </label>
      <label>Cargo
        <input name="cargo" type="text" placeholder="Ex.: Desenvolvedora Front-End">
      </label>
      <label class="check"><input name="mostrarCargo" type="checkbox" checked> Mostrar cargo</label>
      <label>E-mail
        <input name="email" type="email" placeholder="nome@convertize.com.br">
      </label>
      <label>Celular
        <input name="celular" type="tel" placeholder="+55 (16) 99999-9999">
      </label>
      <label>Ramal
        <input name="ramal" type="text" inputmode="numeric" placeholder="201">
      </label>
      <label class="check"><input name="endereco" type="checkbox"> Mostrar endereço</label>
      <label class="check"><input name="disclaimer" type="checkbox"> Incluir disclaimer</label>
    </form>

    <section class="resultado">
      <div id="preview" class="preview" aria-live="polite"></div>
      <div class="acoes">
        <button type="button" id="copiar-gmail">Copiar para o Gmail</button>
        <button type="button" id="copiar-html" class="secundario">Copiar código HTML</button>
      </div>
      <details class="tutorial">
        <summary>Como configurar no Gmail</summary>
        <ol>
          <li>Clique em <strong>Copiar para o Gmail</strong> acima.</li>
          <li>No Gmail, clique na engrenagem (canto superior direito) e em <strong>Ver todas as configurações</strong>.</li>
          <li>Na aba <strong>Geral</strong>, role até <strong>Assinatura</strong> e clique em <strong>Criar nova</strong>. Dê um nome, por exemplo "Convertize".</li>
          <li>Clique dentro da caixa de edição da assinatura e cole com <kbd>Ctrl</kbd>+<kbd>V</kbd> (Windows) ou <kbd>Cmd</kbd>+<kbd>V</kbd> (Mac).</li>
          <li>Em <strong>Padrões de assinatura</strong>, selecione essa assinatura para <em>novos e-mails</em> e para <em>respostas/encaminhamentos</em>.</li>
          <li>Role até o fim da página e clique em <strong>Salvar alterações</strong>.</li>
        </ol>
        <p class="nota">As imagens vêm de um CDN. Se não aparecerem de imediato, envie um e-mail de teste para você mesmo e confira.</p>
      </details>
    </section>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Criar `styles.css`**

```css
:root {
  --bg: #f4f5f7;
  --card: #ffffff;
  --text: #1b1f27;
  --muted: #6b7280;
  --line: #e5e7eb;
  --brand: #fc5830;
  --brand-dark: #0b0d5d;
  --erro: #b91c1c;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
}
.topo { max-width: 1100px; margin: 0 auto; padding: 24px 16px 8px; }
.topo h1 { margin: 0 0 4px; font-size: 24px; color: var(--brand-dark); }
.topo p { margin: 0; color: var(--muted); }
.layout { display: grid; gap: 24px; max-width: 1100px; margin: 0 auto; padding: 16px; }
@media (min-width: 900px) {
  .layout { grid-template-columns: 340px 1fr; align-items: start; }
}
.painel, .resultado {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 20px;
}
.painel label { display: block; margin-bottom: 14px; font-size: 13px; font-weight: 600; }
.painel input[type="text"], .painel input[type="email"], .painel input[type="tel"], .painel select {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 9px 10px;
  font: inherit;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
}
.painel input:focus, .painel select:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
.painel .check { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.painel .check input { margin: 0; }
.painel label:has(input:disabled) { color: var(--muted); }
.preview {
  min-height: 160px;
  padding: 20px;
  background: #fff;
  border: 1px dashed var(--line);
  border-radius: 8px;
  overflow-x: auto;
}
.preview.erro { color: var(--erro); font-size: 14px; }
.acoes { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.acoes button {
  padding: 10px 16px;
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
  border: 1px solid var(--brand);
  border-radius: 6px;
  cursor: pointer;
}
.acoes button.secundario { color: var(--brand-dark); background: #fff; border-color: var(--line); }
.acoes button:disabled { opacity: 0.5; cursor: not-allowed; }
.acoes button.erro { color: #fff; background: var(--erro); border-color: var(--erro); }
.tutorial { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 14px; }
.tutorial summary { font-weight: 600; cursor: pointer; }
.tutorial ol { padding-left: 20px; line-height: 1.6; }
.tutorial kbd { padding: 0 5px; font-family: inherit; background: #f9fafb; border: 1px solid var(--line); border-radius: 4px; }
.tutorial .nota { color: var(--muted); }
```

- [ ] **Step 3: Criar `app.js`**

```js
import {
  listThemes, getThemeTemplate, renderSignature, copySignature, copyText, paramsFromUrl,
} from './lib/signature.js';
import { toSearchParams, STRING_KEYS } from './lib/params.js';

const OPTIONS = { baseUrl: './' };
const TOGGLES = { mostrarCargo: 'cargo', endereco: 'endereco', disclaimer: 'disclaimer' };

const form = document.getElementById('form');
const preview = document.getElementById('preview');
const themeSelect = document.getElementById('theme');
const btnGmail = document.getElementById('copiar-gmail');
const btnHtml = document.getElementById('copiar-html');

let currentHtml = '';
let seq = 0;

function readForm() {
  const el = form.elements;
  return {
    theme: el.theme.value,
    nome: el.nome.value,
    cargo: el.mostrarCargo.checked ? el.cargo.value : '',
    email: el.email.value,
    celular: el.celular.value,
    ramal: el.ramal.value,
    endereco: el.endereco.checked,
    disclaimer: el.disclaimer.checked,
  };
}

function fillForm(params) {
  const el = form.elements;
  themeSelect.value = params.theme;
  if (themeSelect.selectedIndex === -1) themeSelect.selectedIndex = 0;
  for (const key of STRING_KEYS) el[key].value = params[key];
  el.endereco.checked = params.endereco;
  el.disclaimer.checked = params.disclaimer;
  el.mostrarCargo.checked = true;
}

function syncUrl(params) {
  history.replaceState(null, '', `?${toSearchParams(params)}`);
}

function showError(err) {
  currentHtml = '';
  preview.textContent = err.message;
  preview.classList.add('erro');
  btnGmail.disabled = btnHtml.disabled = true;
}

async function updateToggles(theme) {
  const template = await getThemeTemplate(theme, OPTIONS);
  for (const [field, block] of Object.entries(TOGGLES)) {
    const input = form.elements[field];
    const supported = template.includes(`{{#${block}}}`);
    input.disabled = !supported;
    input.closest('label').title = supported ? '' : 'Este tema não tem este bloco';
  }
}

async function update() {
  const mySeq = ++seq;
  const params = readForm();
  syncUrl(params);
  const hasName = params.nome.trim() !== '';
  try {
    const html = await renderSignature({ ...params, nome: hasName ? params.nome : 'Seu nome' }, OPTIONS);
    if (mySeq !== seq) return;
    currentHtml = html;
    preview.innerHTML = html;
    preview.classList.remove('erro');
    btnGmail.disabled = btnHtml.disabled = !hasName;
  } catch (err) {
    if (mySeq !== seq) return;
    showError(err);
  }
}

function feedback(button, message, isError = false) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = message;
  button.classList.toggle('erro', isError);
  setTimeout(() => {
    button.textContent = button.dataset.label;
    button.classList.remove('erro');
  }, 2000);
}

function bindCopy(button, action) {
  button.addEventListener('click', async () => {
    try {
      await action(currentHtml);
      feedback(button, 'Copiado!');
    } catch (err) {
      feedback(button, err.message, true);
    }
  });
}

bindCopy(btnGmail, copySignature);
bindCopy(btnHtml, copyText);

form.addEventListener('input', update);
form.addEventListener('change', async (event) => {
  if (event.target === themeSelect) {
    try {
      await updateToggles(themeSelect.value);
    } catch (err) {
      showError(err);
      return;
    }
  }
  update();
});

async function init() {
  try {
    const themes = await listThemes(OPTIONS);
    for (const theme of themes) {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.label;
      themeSelect.appendChild(option);
    }
    fillForm(paramsFromUrl());
    await updateToggles(themeSelect.value);
    await update();
  } catch (err) {
    showError(err);
  }
}

init();
```

- [ ] **Step 4: Verificar manualmente no navegador**

```bash
cd /Users/gabrielgaliaso/Projects/convertize-signatures && (python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8765/
```

Expected: `200`.

Abra `http://localhost:8765/?theme=v1&nome=Gabriel+Galiaso&cargo=CEO&ramal=201&endereco=1&disclaimer=1` (Chrome DevTools MCP se disponível: `navigate_page`, `take_screenshot`, `list_console_messages`). Confirme:

1. Formulário preenchido com os valores da URL e preview com nome, "CEO", "Ramal 201", endereço e os dois blocos de disclaimer.
2. Nenhum erro no console.
3. Trocar o tema para "Escuro" re-renderiza e a URL muda para `theme=v3`.
4. Desmarcar "Mostrar cargo" tira o "CEO" do preview e remove `cargo=` da URL.
5. Apagar o nome mostra "Seu nome" no preview e desabilita os dois botões.
6. Clicar em "Copiar para o Gmail" mostra "Copiado!" por 2 segundos.
7. Abrir `http://localhost:8765/?theme=v9` mostra "Tema desconhecido: v9" em vermelho no lugar do preview.
8. Largura 400px (`resize_page` ou DevTools): colunas empilham, preview rola horizontalmente, sem rolagem horizontal na página.

Ao final, encerre o servidor: `pkill -f "http.server 8765"`.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "Add signature generator page with live preview, URL state and Gmail copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: README e instruções de deploy

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nomes públicos das Tasks 3, 4 e 6.

- [ ] **Step 1: Escrever `README.md`**

````markdown
# Assinaturas de e-mail Convertize

Gerador estático de assinaturas, com versões em `v1/`, `v2/`, `v3/`. Roda no GitHub Pages; biblioteca, temas e imagens são servidos pelo jsDelivr. Sem servidor, sem build.

## Usar o gerador

Abra a página publicada, preencha os campos e clique em **Copiar para o Gmail**. O tutorial de configuração do Gmail está na própria página, com o link direto para a tela de assinatura do Gmail.

Todos os campos podem vir pela URL, para abrir já preenchido:

```
https://OWNER.github.io/REPO/?versao=v1&nome=Gabriel+Galiaso&cargo=CEO&ramal=201&celular=%2B55+16+99999-0000&email=gabriel@convertize.com.br&endereco=1&disclaimer=1
```

| parâmetro | tipo | observação |
|---|---|---|
| `versao` | string | `v1` (padrão), `v2`, `v3` |
| `nome` | string | obrigatório |
| `cargo`, `email`, `celular`, `ramal` | string | opcionais; ausente = não aparece |
| `endereco`, `disclaimer` | booleano | `1`, `true` ou `sim` liga |

## Usar como biblioteca (console, intranet)

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/OWNER/REPO@main/lib/signature.js"></script>

<convertize-signature versao="v1" nome="Gabriel Galiaso" cargo="CEO" ramal="201" endereco disclaimer botao-copiar></convertize-signature>
```

Ou por código:

```js
import { renderSignature, copySignature, listVersions } from 'https://cdn.jsdelivr.net/gh/OWNER/REPO@main/lib/signature.js';

const html = await renderSignature({ versao: 'v1', nome: 'Gabriel Galiaso', cargo: 'CEO', ramal: '201', endereco: true, disclaimer: true });
await copySignature(html); // coloca a assinatura formatada no clipboard
```

Também disponível em `window.ConvertizeSignature` depois que o script carrega. Atributos do elemento: os mesmos parâmetros, mais `botao-copiar` (mostra um botão "Copiar assinatura") e `base-url` (de onde ler as versões; padrão é o jsDelivr).

## Adicionar uma versão

1. Crie `v4/theme.html` e as imagens em `v4/` (o nome do arquivo `theme.html` é fixo).
2. Use as variáveis `{{nome}} {{cargo}} {{email}} {{celular}} {{ramal}}`, `{{cdn}}/v4/arquivo.png` nas imagens, `{{empresa.telefoneRP}}` etc. de `config.js`, e os blocos opcionais `{{#cargo}}...{{/cargo}}`, `{{#ramal}}`, `{{#celular}}`, `{{#email}}`, `{{#endereco}}` (`{{endereco.linha1}}`, `{{endereco.linha2}}`) e `{{#disclaimer}}` (`{{disclaimer.tituloPT}}`, `{{disclaimer.textoPT}}`, `{{disclaimer.tituloEN}}`, `{{disclaimer.textoEN}}`).
3. Acrescente `{ "id": "v4", "label": "v4" }` em `versions.json`.
4. Rode `npm test`: os testes verificam todas as versões listadas.

## Desenvolvimento

```bash
npm test                      # testes (Node 22, sem dependências)
python3 -m http.server 8765   # abra http://localhost:8765/
```

`exemplos/embed.html` mostra a tag e a API funcionando com as versões locais.

## Deploy

1. Repositório **público** no GitHub (o jsDelivr só serve repositórios públicos).
2. Em `config.js`, troque `OWNER/REPO` em `CDN_BASE` pelo caminho real.
3. Settings > Pages > Deploy from a branch > `main` / `/ (root)`.
4. A página fica em `https://OWNER.github.io/REPO/`.

### Cache do jsDelivr

- `@main` é cacheado por até 12 horas. Para forçar atualização de um arquivo: `https://purge.jsdelivr.net/gh/OWNER/REPO@main/v1/logo.png`.
- No console, prefira pinar uma tag (`@v1.0.0`) e trocar a tag quando quiser atualizar. Com tag fixa dá para acrescentar `integrity="sha384-..." crossorigin="anonymous"` na tag `<script>` (gere o hash com `curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`); com `@main` não use `integrity`, porque o hash muda a cada commit.
````

- [ ] **Step 2: Conferir que os exemplos do README batem com o código**

Run: `grep -n "export" lib/core.js lib/clipboard.js | grep -oE "function \w+|export \* from" | sort -u`
Expected: inclui `renderSignature`, `copySignature`, `listVersions`, `getVersionTemplate`, `copyText`, `paramsFromUrl`, `buildContext`, `htmlToText`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add README with usage, embed API, theme authoring and deploy notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Renomear "tema" para "versão" e link direto do Gmail

**Files:**
- Modify: `lib/params.js`, `lib/core.js`, `lib/element.js`, `app.js`, `index.html`, `styles.css`, `exemplos/embed.html`
- Rename: `themes.json` → `versions.json`; `tests/themes.test.js` → `tests/versions.test.js`
- Modify tests: `tests/params.test.js`, `tests/core.test.js`, `tests/versions.test.js`

**Interfaces:**
- Consumes: tudo das Tasks 1-6.
- Produces (nomes públicos finais): parâmetro `versao` (URL, função e atributo) no lugar de `theme`; `DEFAULT_VERSAO` no lugar de `DEFAULT_THEME`; `listVersions` no lugar de `listThemes`; `getVersionTemplate` no lugar de `getThemeTemplate`; manifesto `versions.json`; erro `Versão desconhecida: <id>`. Os arquivos `vN/theme.html` e `config.js` não mudam.

Motivo: o usuário prefere falar em "versão v1, v2, v3" em vez de "tema". Nada foi publicado ainda, então não há compatibilidade a manter: não deixe alias `theme`.

- [ ] **Step 1: Renomear o manifesto e os rótulos**

```bash
git mv themes.json versions.json
```

Conteúdo de `versions.json`:

```json
[
  { "id": "v1", "label": "v1" },
  { "id": "v2", "label": "v2" },
  { "id": "v3", "label": "v3" }
]
```

- [ ] **Step 2: Atualizar os testes primeiro (RED)**

Em `tests/params.test.js`: importar `DEFAULT_VERSAO` em vez de `DEFAULT_THEME`; trocar toda chave `theme` por `versao` nos objetos esperados e nas entradas (`'?theme=v2&...'` vira `'?versao=v2&...'`; `'theme=v1&nome=Ana'` vira `'versao=v1&nome=Ana'`; `'theme=v3&nome=Ana&ramal=201&endereco=1'` vira `'versao=v3&nome=Ana&ramal=201&endereco=1'`); o teste "theme vazio ou só espaços cai no default" vira "versao vazia ou só espaços cai no default" com `parseParams({ versao: '  ' }).versao`.

Em `tests/core.test.js`: importar `listVersions` e `getVersionTemplate`; o fake de arquivos usa `${baseUrl}/versions.json`; todo `theme: 'vt'` vira `versao: 'vt'`; o teste de tema desconhecido vira "versão desconhecida ou com caminho relativo falha sem buscar o arquivo" e espera `/Versão desconhecida: v9/` e `/Versão desconhecida: \.\.\/x/`, com `calls.every((url) => url.endsWith('/versions.json'))`; o teste de cache conta `/versions.json`; `paramsFromUrl('https://x.test/app/?nome=Ana+Souza&disclaimer=1&versao=v2')` espera `p.versao === 'v2'`; o teste `listThemes devolve o manifesto` vira `listVersions devolve o manifesto`.

`git mv tests/themes.test.js tests/versions.test.js` e dentro dele: ler `versions.json`; `buildContext({ versao: id, ...FULL }, ...)` e `buildContext({ versao: id, nome: 'Ana Souza' })`; mensagem do `assert.ok(themes.length >= 3, ...)` vira `'versions.json deve listar v1, v2 e v3'`; renomear a variável `themes` para `versions`.

Run: `npm test`
Expected: falhas em params, core e versions (nomes ainda não existem).

- [ ] **Step 3: Renomear no código (GREEN)**

`lib/params.js`: `export const DEFAULT_VERSAO = 'v1';`; em `parseParams`, `const params = { versao: clean(raw.versao) || DEFAULT_VERSAO };`; em `toSearchParams`, `sp.set('versao', p.versao);`.

`lib/core.js`: `const VERSION_ID = /^[a-z0-9_-]+$/i;`; `listVersions` busca `versions.json`; `getVersionTemplate(versao, options)` valida com `VERSION_ID` e com o manifesto e lança `new Error(\`Versão desconhecida: ${versao}\`)`; chave de cache `${baseUrl}|${versao}`; `renderSignature` usa `getVersionTemplate(p.versao, options)`.

`lib/element.js`: `observedAttributes` devolve `['versao', ...STRING_KEYS, ...BOOL_KEYS, 'botao-copiar', 'base-url']`; `#params()` lê `['versao', ...STRING_KEYS]`.

`app.js`: importar `listVersions, getVersionTemplate` e usar nos lugares de `listThemes, getThemeTemplate`; renomear `themeSelect` para `versaoSelect` (id `versao`); `readForm` devolve `versao: el.versao.value`; `fillForm` usa `params.versao`; `updateToggles(versao)`; no `change`, comparar com `versaoSelect`.

`index.html`: o campo vira

```html
<label>Versão
  <select name="versao" id="versao"></select>
</label>
```

`exemplos/embed.html`: `versao="v1"` na tag e `{ versao: 'v3', ... }` na chamada da API.

Run: `npm test`
Expected: 48 testes, todos `ok`, sem nenhum `theme` restante em `lib/`, `app.js`, `index.html`, `exemplos/`, `tests/` (`grep -rn "theme" lib app.js index.html exemplos tests` deve devolver só ocorrências de `theme.html`, que é o nome fixo do arquivo de template).

- [ ] **Step 4: Link direto para as configurações do Gmail**

Em `index.html`, dentro de `.acoes`, depois do botão "Copiar código HTML":

```html
<a class="botao-link" href="https://mail.google.com/mail/u/0/#settings/general" target="_blank" rel="noopener">Abrir configurações do Gmail</a>
```

E o passo 2 do tutorial passa a ser:

```html
<li>Abra <a href="https://mail.google.com/mail/u/0/#settings/general" target="_blank" rel="noopener">as configurações do Gmail</a> (ou, no Gmail, clique na engrenagem e em <strong>Ver todas as configurações</strong>).</li>
```

Em `styles.css`, logo após a regra `.acoes button.secundario { ... }`:

```css
.acoes .botao-link {
  display: inline-block;
  padding: 10px 16px;
  font: inherit;
  font-weight: 600;
  color: var(--brand-dark);
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
  text-decoration: none;
}
```

- [ ] **Step 5: Verificar no navegador**

```bash
cd /Users/gabrielgaliaso/Projects/convertize-signatures && (python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8765/
```

Abrir `http://localhost:8765/?versao=v2&nome=Gabriel+Galiaso&cargo=CEO&ramal=201&endereco=1&disclaimer=1` e confirmar: rótulo "Versão" com opções v1, v2, v3; v2 selecionada e renderizada; trocar para v3 muda a URL para `versao=v3`; o link "Abrir configurações do Gmail" aparece ao lado dos botões e aponta para `https://mail.google.com/mail/u/0/#settings/general` com `target="_blank"`; `?versao=v9&nome=Teste` mostra "Versão desconhecida: v9"; `exemplos/embed.html` renderiza as duas assinaturas; console sem erros (favicon 404 ignorado). Encerrar: `pkill -f "http.server 8765"`.

- [ ] **Step 6: Commit**

```bash
git add -A lib app.js index.html styles.css exemplos tests versions.json
git commit -m "Rename theme to versao across URL, API and UI; add Gmail settings link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
