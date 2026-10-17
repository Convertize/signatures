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
