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
