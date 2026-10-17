import { renderSignature } from './core.js';
import { copySignature } from './clipboard.js';
import { STRING_KEYS, BOOL_KEYS } from './params.js';

const LABEL_COPIAR = 'Copiar assinatura';

function flash(button, message) {
  button.textContent = message;
  setTimeout(() => {
    button.textContent = LABEL_COPIAR;
  }, 2000);
}

export class ConvertizeSignatureElement extends HTMLElement {
  static get observedAttributes() {
    return ['theme', ...STRING_KEYS, ...BOOL_KEYS, 'botao-copiar', 'base-url'];
  }

  #seq = 0;

  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #params() {
    const raw = {};
    for (const key of ['theme', ...STRING_KEYS]) {
      if (this.hasAttribute(key)) raw[key] = this.getAttribute(key);
    }
    for (const key of BOOL_KEYS) {
      if (this.hasAttribute(key)) {
        const value = this.getAttribute(key);
        raw[key] = value === '' ? true : value;
      }
    }
    return raw;
  }

  async #render() {
    const seq = ++this.#seq;
    const options = {};
    if (this.hasAttribute('base-url')) options.baseUrl = this.getAttribute('base-url');
    try {
      const html = await renderSignature(this.#params(), options);
      if (seq !== this.#seq) return;
      this.replaceChildren();
      const box = document.createElement('div');
      box.className = 'convertize-signature__preview';
      box.innerHTML = html;
      this.appendChild(box);
      if (this.hasAttribute('botao-copiar')) this.appendChild(this.#button(html));
    } catch (err) {
      if (seq !== this.#seq) return;
      this.textContent = err.message;
    }
  }

  #button(html) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'convertize-signature__copy';
    button.textContent = LABEL_COPIAR;
    button.addEventListener('click', async () => {
      try {
        await copySignature(html);
        flash(button, 'Copiado!');
      } catch (err) {
        flash(button, err.message);
      }
    });
    return button;
  }
}

if (!customElements.get('convertize-signature')) {
  customElements.define('convertize-signature', ConvertizeSignatureElement);
}
