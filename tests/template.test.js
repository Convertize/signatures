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

test('blocos aninhados com a mesma chave', () => {
  assert.equal(render('{{#a}}1{{#a}}2{{/a}}3{{/a}}', { a: true }), '123');
  assert.equal(render('{{#a}}1{{#a}}2{{/a}}3{{/a}}', { a: false }), '');
});

test('erro de sintaxe dentro de bloco falso ainda é reportado', () => {
  assert.throws(() => render('{{#x}}{{#a}}{{/x}}', { x: false }), /Bloco não fechado: a/);
});
