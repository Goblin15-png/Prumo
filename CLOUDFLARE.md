# Cloudflare Workers — frontend da Pruma Essential

## Diagnóstico de 31/10/2026

O endereço fornecido, `https://prumo.bernadin15-dev.workers.dev/`, respondia com o HTML de desenvolvimento, incluindo `<script type="module" src="/src/main.jsx">`. Esse arquivo era servido como `text/jsx`, com JSX e imports de pacotes não compilados; `/theme-init.js` retornava 404. Isso impede o navegador de iniciar a aplicação. Não é um problema que se resolva cadastrando cartão.

O endereço é de **Workers**, não Pages. A configuração `frontend/vercel.json` também não configura um Worker. O arquivo `wrangler.json` na raiz aponta exclusivamente para o build estático em `frontend/dist` e habilita navegação SPA, inclusive `/admin` e `/reset-password`. Os cabeçalhos estáticos em `frontend/public/_headers` preservam as proteções básicas já previstas na configuração Vercel; a política CSP completa continua sendo emitida no HTML pelo Vite. Ele não executa PHP, não cria MySQL e não publica a pasta backend, código-fonte ou arquivos de testes.

## Se o Worker estiver conectado ao GitHub

No Worker existente **prumo**, em **Settings → Build/Builds**, configure os valores abaixo. A raiz deve ser a raiz do repositório, pois o arquivo Wrangler e os comandos deste documento usam esse ponto de partida:

| Campo | Valor |
| --- | --- |
| Root directory | Raiz do repositório: deixar vazio ou `.` conforme a interface |
| Build command | `npm --prefix frontend ci && npm --prefix frontend run build` |
| Deploy command | `npx wrangler deploy --config wrangler.json` |
| Production branch | Branch aprovada pela equipe; normalmente `main` |

Incorpore o PR que contém `wrangler.json` na branch escolhida antes de refazer o deploy. Remova do comando antigo opções como `--assets ./frontend`, `--assets .` ou `--assets ./frontend/public`, pois apontam para pastas que não são o build. Não basta reenviar o mesmo código-fonte sem compilar.

Essas instruções não alteram a conta Cloudflare nem publicam o site automaticamente. O operador deve revisar o Worker/branch de destino no painel. O nome `prumo` corresponde ao Worker indicado pelo endereço fornecido; não implica mudança da marca pública Pruma Essential. As alterações de identidade estão em PR separado.

## Se o envio tiver sido manual

Compile no computador com os comandos de build acima. Depois envie **o conteúdo de `frontend/dist`**, que inclui `index.html`, `assets/`, `theme-init.js`, `google-tag-manager.js` e imagens públicas. Não envie `frontend/index.html`, `frontend/src`, a pasta `public` isolada ou a raiz inteira do repositório.

Para preparar/validar o empacotamento pelo CLI, sem publicação, execute na raiz depois do build:

```sh
npx wrangler deploy --config wrangler.json --dry-run
```

O deploy real é uma etapa separada. A configuração Wrangler só é usada por operações feitas com esse arquivo; uma nova carga manual de pastas incorretas pode repetir o problema.

## Verificação depois da publicação

- A página inicial deve apontar para JavaScript compilado em `/assets/...js`, sem referência a `/src/main.jsx`.
- O arquivo JavaScript referenciado deve responder com tipo JavaScript, não `text/jsx` ou HTML.
- `/theme-init.js` e `/google-tag-manager.js` devem responder com sucesso.
- Abrir `/admin` e `/reset-password` diretamente deve carregar a interface SPA.
- Arquivos de desenvolvimento e configuração privada não devem fazer parte do upload; não publique `.env`, `backend/`, `testes/` ou fontes por meio de outra pasta de assets.

## API e limites

Esta correção faz o frontend carregar, mas não conecta o Laravel. O site usa `/api/v1` por padrão; sem backend/encaminhamento configurado, o catálogo e a autenticação continuam indisponíveis, com os estados de erro da interface. Não coloque senhas de banco ou tokens de provedores em variáveis `VITE_*`.

Antes de ativar a API, definir sua hospedagem/URL HTTPS e validar o contrato de proxy, cookies e Sanctum conforme `DEPLOYMENT.md` e `ADMIN_ACCESS.md`. Um domínio externo de API não resolve sozinho a autenticação por cookie em um host `workers.dev`. Não foi criado proxy com destino fictício, não foram alteradas as configurações Vercel, e não houve mudança de infraestrutura ou publicação nesta correção.

Documentação oficial: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) e [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
