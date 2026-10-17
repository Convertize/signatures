import { htmlToText, withLeadingBreaks } from './core.js';

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

export async function copySignature(html, { linhasAntes = 3 } = {}) {
  const htmlFinal = withLeadingBreaks(html, linhasAntes);
  const text = '\n'.repeat(linhasAntes) + htmlToText(html);
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([htmlFinal], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      // cai no fallback por seleção
    }
  }
  const holder = offscreen(document.createElement('div'));
  holder.contentEditable = 'true';
  holder.innerHTML = htmlFinal;
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
