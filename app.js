import {
  listThemes, getThemeTemplate, renderSignature, copySignature, copyText, paramsFromUrl,
} from './lib/signature.js';
import { toSearchParams, STRING_KEYS } from './lib/params.js';

const OPTIONS = { baseUrl: './' };
const TOGGLES = { mostrarCargo: 'cargo', endereco: 'endereco', disclaimer: 'disclaimer' };

const form = document.getElementById('form');
const preview = document.getElementById('preview');
const themeSelect = document.getElementById('theme');
const btnGmail = document.getElementById('copiar-gmail');
const btnHtml = document.getElementById('copiar-html');

let currentHtml = '';
let seq = 0;

function readForm() {
  const el = form.elements;
  return {
    theme: el.theme.value,
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
  themeSelect.value = params.theme;
  if (themeSelect.selectedIndex === -1) {
    // Unknown theme in the URL: keep it selectable so the render shows "Tema desconhecido".
    const option = document.createElement('option');
    option.value = option.textContent = params.theme;
    themeSelect.appendChild(option);
    themeSelect.value = params.theme;
  }
  for (const key of STRING_KEYS) el[key].value = params[key];
  el.endereco.checked = params.endereco;
  el.disclaimer.checked = params.disclaimer;
  el.mostrarCargo.checked = true;
}

function syncUrl(params) {
  history.replaceState(null, '', `?${toSearchParams(params)}`);
}

function showError(err) {
  currentHtml = '';
  preview.textContent = err.message;
  preview.classList.add('erro');
  btnGmail.disabled = btnHtml.disabled = true;
}

async function updateToggles(theme) {
  const template = await getThemeTemplate(theme, OPTIONS);
  for (const [field, block] of Object.entries(TOGGLES)) {
    const input = form.elements[field];
    const supported = template.includes(`{{#${block}}}`);
    input.disabled = !supported;
    input.closest('label').title = supported ? '' : 'Este tema não tem este bloco';
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
bindCopy(btnHtml, copyText);

form.addEventListener('input', update);
form.addEventListener('change', async (event) => {
  if (event.target === themeSelect) {
    try {
      await updateToggles(themeSelect.value);
    } catch (err) {
      showError(err);
      return;
    }
  }
  update();
});

async function init() {
  try {
    const themes = await listThemes(OPTIONS);
    for (const theme of themes) {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.label;
      themeSelect.appendChild(option);
    }
    fillForm(paramsFromUrl());
    await updateToggles(themeSelect.value);
    await update();
  } catch (err) {
    showError(err);
  }
}

init();
