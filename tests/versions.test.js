import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { render } from '../lib/template.js';
import { buildContext } from '../lib/core.js';

const root = new URL('../', import.meta.url);
const versions = JSON.parse(await readFile(new URL('versions.json', root), 'utf8'));
const BLOCKS = ['cargo', 'ramal', 'celular', 'email', 'endereco', 'disclaimer'];
const FULL = {
  nome: 'Ana Souza', cargo: 'Desenvolvedora', email: 'ana@convertize.com.br',
  celular: '+55 (16) 99999-0000', ramal: '201', endereco: true, disclaimer: true,
};

assert.ok(versions.length >= 3, 'versions.json deve listar v1, v2 e v3');

for (const { id } of versions) {
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

  test(`${id}: lint de e-mail (sem <style>, imagens com tamanho e CDN, tabelas balanceadas)`, () => {
    assert.ok(!/<style/i.test(template), 'não pode ter <style>');
    // display:block em <img> é seguro no Outlook (remove o espaço sob a imagem); só vale para span/strong.
    const semImg = template.replace(/<img\b[^>]*>/gi, '');
    assert.ok(!/display:\s*block/i.test(semImg), 'não usar display:block (Outlook ignora em inline)');
    const imgs = template.match(/<img\b[^>]*>/gi) || [];
    assert.ok(imgs.length > 0);
    for (const img of imgs) {
      assert.ok(/\bsrc="\{\{cdn\}\}\/[^"]+"/.test(img), `img sem {{cdn}}: ${img}`);
      assert.ok(/\bwidth="\d+"/.test(img) && /\bheight="\d+"/.test(img), `img sem width/height: ${img}`);
    }
    const opens = (template.match(/<table\b/gi) || []).length;
    const closes = (template.match(/<\/table>/gi) || []).length;
    assert.equal(opens, closes, 'tabelas desbalanceadas');
    const tdOpens = (template.match(/<td\b/gi) || []).length;
    const tdCloses = (template.match(/<\/td>/gi) || []).length;
    assert.equal(tdOpens, tdCloses, 'td desbalanceados');
  });

  test(`${id}: completo renderiza todos os dados`, () => {
    const html = render(template, buildContext({ versao: id, ...FULL }, { cdn: 'https://cdn.test' }));
    const esperados = [
      'Ana Souza', 'Desenvolvedora', '201', '+55 (16) 99999-0000', 'mailto:ana@convertize.com.br',
      'Rua Maestro Joaquim Rangel, 795', '14025-610', 'AVISO LEGAL', 'DISCLAIMER',
      '+55 (16) 3075.7676', '+55 (11) 4010.7676', `https://cdn.test/${id}/logo.png`,
    ];
    for (const s of esperados) assert.ok(html.includes(s), `faltou "${s}"`);
    assert.ok(!html.includes('{{'), 'sobrou tag de template');
  });

  test(`${id}: só com nome esconde os blocos opcionais`, () => {
    const html = render(template, buildContext({ versao: id, nome: 'Ana Souza' }));
    for (const s of ['Desenvolvedora', 'Ramal', 'mailto:', 'Rua Maestro', 'AVISO LEGAL', 'DISCLAIMER']) {
      assert.ok(!html.includes(s), `não devia ter "${s}"`);
    }
    assert.ok(html.includes('Ana Souza'));
  });
}
