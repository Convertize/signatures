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

// Finds the {{/key}} that balances the opener, counting same-key nested openers.
function findClosing(template, from, key) {
  const re = new RegExp(`\\{\\{\\s*([#/])\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
  re.lastIndex = from;
  let depth = 1;
  let match;
  while ((match = re.exec(template)) !== null) {
    depth += match[1] === '#' ? 1 : -1;
    if (depth === 0) return { start: match.index, end: match.index + match[0].length };
  }
  return null;
}

// emit=false parses and validates the segment but appends nothing.
function renderSegment(template, context, emit) {
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
      const show = emit && isTruthy(lookup(context, key));
      out += renderSegment(template.slice(close + 2, closing.start), context, show);
      i = closing.end;
    } else if (tag.startsWith('/')) {
      throw new Error(`Fechamento inesperado: ${tag.slice(1).trim()}`);
    } else {
      const value = lookup(context, tag);
      if (emit && value != null) out += escapeHtml(value);
      i = close + 2;
    }
  }
  return emit ? out : '';
}

export function render(template, context = {}) {
  return renderSegment(template, context, true);
}
