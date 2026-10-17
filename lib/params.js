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
