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
