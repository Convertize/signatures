import {
  listVersions, getVersionTemplate, renderSignature, copySignature, copyText, paramsFromUrl, withLeadingBreaks,
} from './lib/signature.js';
import { toSearchParams, STRING_KEYS } from './lib/params.js';

const OPTIONS = { baseUrl: './' };
const TOGGLES = { mostrarCargo: 'cargo', endereco: 'endereco', disclaimer: 'disclaimer' };

const form = document.getElementById('form');
const preview = document.getElementById('preview');
const versaoSelect = document.getElementById('versao');
const btnGmail = document.getElementById('copiar-gmail');
const btnHtml = document.getElementById('copiar-html');

let currentHtml = '';
let seq = 0;

function readForm() {
  const el = form.elements;
  return {
    versao: el.versao.value,
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
  versaoSelect.value = params.versao;
  if (versaoSelect.selectedIndex === -1) {
    // Unknown version in the URL: keep it selectable so the render shows "Versão desconhecida".
    const option = document.createElement('option');
    option.value = option.textContent = params.versao;
    versaoSelect.appendChild(option);
    versaoSelect.value = params.versao;
  }
  for (const key of STRING_KEYS) el[key].value = params[key];
  el.endereco.checked = params.endereco;
  el.disclaimer.checked = params.disclaimer;
  el.mostrarCargo.checked = true;
}

function syncUrl(params) {
  try {
    history.replaceState(null, '', `?${toSearchParams(params)}`);
  } catch {
    /* limite de replaceState do navegador; a URL fica desatualizada, o preview não */
  }
}

function showError(err) {
  currentHtml = '';
  preview.textContent = err.message;
  preview.classList.add('erro');
  btnGmail.disabled = btnHtml.disabled = true;
}

async function updateToggles(versao) {
  const template = await getVersionTemplate(versao, OPTIONS);
  for (const [field, block] of Object.entries(TOGGLES)) {
    const input = form.elements[field];
    const supported = new RegExp(`\\{\\{#\\s*${block}\\s*\\}\\}`).test(template);
    input.disabled = !supported;
    input.closest('label').title = supported ? '' : 'Esta versão não tem este bloco';
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
bindCopy(btnHtml, (html) => copyText(withLeadingBreaks(html)));

form.addEventListener('input', update);
form.addEventListener('change', async (event) => {
  // Campos de texto já disparam update pelo evento input.
  if (event.target.matches('input[type="text"], input[type="email"], input[type="tel"]')) return;
  if (event.target === versaoSelect) {
    try {
      await updateToggles(versaoSelect.value);
    } catch (err) {
      showError(err);
      return;
    }
  }
  update();
});

async function init() {
  try {
    const versions = await listVersions(OPTIONS);
    for (const v of versions) {
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = v.label;
      versaoSelect.appendChild(option);
    }
    fillForm(paramsFromUrl());
    await updateToggles(versaoSelect.value);
    await update();
  } catch (err) {
    showError(err);
  }
}

init();
