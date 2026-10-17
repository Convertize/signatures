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
  return cached(manifestCache, baseUrl, async () =>
    JSON.parse(await fetchText(joinUrl(baseUrl, 'themes.json'), options)),
  );
}

export async function getThemeTemplate(theme, options = {}) {
  const { baseUrl = CDN_BASE } = options;
  const themes = await listThemes(options);
  if (!THEME_ID.test(theme) || !themes.some((t) => t.id === theme)) {
    throw new Error(`Tema desconhecido: ${theme}`);
  }
  return cached(templateCache, `${baseUrl}|${theme}`, () =>
    fetchText(joinUrl(baseUrl, `${theme}/theme.html`), options),
  );
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
    .replace(/<\/(p|div|td|tr|table|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
