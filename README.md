# Assinaturas de e-mail Convertize

Gerador estático de assinaturas, com versões em `v1/`, `v2/`, `v3/`. A página roda no GitHub Pages; a biblioteca, os templates e as imagens são servidos pelo jsDelivr. Sem servidor, sem build.

## Usar o gerador

Abra a página publicada, preencha os campos e clique em **Copiar para o Gmail**. O tutorial de configuração do Gmail está na própria página, com o link direto para a tela de assinatura do Gmail.

Os dois botões de copiar já incluem três linhas em branco antes da assinatura.

Todos os campos podem vir pela URL, para abrir já preenchido:

```
https://convertize.github.io/signatures/?versao=v1&nome=Gabriel+Galiaso&cargo=CEO&ramal=201&celular=%2B55+16+99999-0000&email=gabriel@convertize.com.br&endereco=1&disclaimer=1
```

| parâmetro | tipo | observação |
|---|---|---|
| `versao` | string | `v1` (padrão), `v2`, `v3` |
| `nome` | string | obrigatório |
| `cargo`, `email`, `celular`, `ramal` | string | opcionais; ausente = não aparece |
| `endereco`, `disclaimer` | booleano | `1`, `true` ou `sim` liga |

## Usar como biblioteca (console, intranet)

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Convertize/signatures@main/lib/signature.js"></script>

<convertize-signature versao="v1" nome="Gabriel Galiaso" cargo="CEO" ramal="201" endereco disclaimer botao-copiar></convertize-signature>
```

Ou por código:

```js
import { renderSignature, copySignature, listVersions } from 'https://cdn.jsdelivr.net/gh/Convertize/signatures@main/lib/signature.js';

const html = await renderSignature({ versao: 'v1', nome: 'Gabriel Galiaso', cargo: 'CEO', ramal: '201', endereco: true, disclaimer: true });
await copySignature(html); // coloca a assinatura formatada no clipboard, com 3 linhas em branco antes
```

A cópia inclui três linhas em branco antes da assinatura, para ela não ficar colada no texto do e-mail; ajuste com `copySignature(html, { linhasAntes: 0 })`.

Também disponível em `window.ConvertizeSignature` depois que o script carrega. Atributos do elemento: os mesmos parâmetros, mais `botao-copiar` (mostra um botão "Copiar assinatura") e `base-url` (de onde ler as versões; padrão é o jsDelivr).

## Adicionar uma versão

1. Crie `v4/theme.html` e as imagens em `v4/` (o nome do arquivo `theme.html` é fixo).
2. Use as variáveis `{{nome}} {{cargo}} {{email}} {{celular}} {{ramal}}`, `{{cdn}}/v4/arquivo.png` nas imagens, `{{empresa.telefoneRP}}` etc. de `config.js`, e os blocos opcionais `{{#cargo}}...{{/cargo}}`, `{{#ramal}}`, `{{#celular}}`, `{{#email}}`, `{{#endereco}}` (`{{endereco.linha1}}`, `{{endereco.linha2}}`) e `{{#disclaimer}}` (`{{disclaimer.tituloPT}}`, `{{disclaimer.textoPT}}`, `{{disclaimer.tituloEN}}`, `{{disclaimer.textoEN}}`).
3. Acrescente `{ "id": "v4", "label": "v4" }` em `versions.json`.
4. Rode `npm test`: os testes verificam todas as versões listadas.

Cuidados:

- Nunca renomeie nem apague PNGs dentro de `vN/`: as assinaturas já instaladas apontam para essas URLs em `@main` para sempre.
- Depois de publicar uma versão nova, faça o purge dos arquivos dela no jsDelivr (ver abaixo); até lá o `@main` pode ficar até 12 h apontando para o commit antigo e as imagens dão 404.
- `base-url` muda só de onde a biblioteca lê `versions.json` e `theme.html`; as imagens (`{{cdn}}`) vêm sempre do jsDelivr, então o preview local de uma versão ainda não publicada aparece sem imagens.
- Os blocos aceitam espaços internos: `{{#cargo}}` e `{{# cargo }}` são equivalentes.

## Desenvolvimento

```bash
npm test                      # testes (Node 22, sem dependências)
python3 -m http.server 8765   # abra http://localhost:8765/
```

`exemplos/embed.html` mostra a tag e a API funcionando com as versões locais.

## Deploy

1. O repositório é `Convertize/signatures`, **público** (o jsDelivr só serve repositórios públicos). Se ele mudar de dono ou nome, atualize `CDN_BASE` em `config.js`: a URL fica gravada nas assinaturas já instaladas, então evite mudar.
2. Settings > Pages > Deploy from a branch > `main` / `/ (root)`.
3. A página fica em `https://convertize.github.io/signatures/`.

### Cache do jsDelivr

- `@main` é cacheado por até 12 horas. Para forçar atualização de um arquivo: `https://purge.jsdelivr.net/gh/Convertize/signatures@main/v1/logo.png`.
- No console, prefira pinar uma tag (`@v1.0.0`) e trocar a tag quando quiser atualizar. Com tag fixa dá para acrescentar `integrity="sha384-..." crossorigin="anonymous"` na tag `<script>` (gere o hash com `curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`); com `@main` não use `integrity`, porque o hash muda a cada commit.
