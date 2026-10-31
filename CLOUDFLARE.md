# Cloudflare Workers — frontend da Pruma Essential

## Diagnóstico de 31/10/2026

O endereço fornecido, `https://prumo.bernadin15-dev.workers.dev/`, respondia com o HTML de desenvolvimento, incluindo `<script type="module" src="/src/main.jsx">`. Esse arquivo era servido como `text/jsx`, com JSX e imports de pacotes não compilados; `/theme-init.js` retornava 404. Isso impede o navegador de iniciar a aplicação. Não é um problema que se resolva cadastrando cartão.

O endereço é de **Workers**, não Pages. A configuração `frontend/vercel.json` também não configura um Worker. O arquivo `wrangler.json` na raiz serve o build estático em `frontend/dist`, habilita navegação SPA (inclusive `/admin` e `/reset-password`) e associa `cloudflare/worker.mjs` ao encaminhamento da API. Os cabeçalhos estáticos em `frontend/public/_headers` preservam as proteções básicas já previstas na configuração Vercel; a política CSP completa continua sendo emitida no HTML pelo Vite. O Worker não executa PHP, não cria MySQL e não publica a pasta backend ou arquivos de testes. O script de transporte é executado no Worker; o React continua sendo servido apenas como build compilado.

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

O deploy real é uma etapa separada. O upload manual apenas de pastas publica a interface, mas não instala o script de proxy; para incluir a API, use o deploy Wrangler com esta configuração. Uma nova carga de pastas incorretas pode repetir a tela branca.

## Verificação depois da publicação

- A página inicial deve apontar para JavaScript compilado em `/assets/...js`, sem referência a `/src/main.jsx`.
- O arquivo JavaScript referenciado deve responder com tipo JavaScript, não `text/jsx` ou HTML.
- `/theme-init.js` e `/google-tag-manager.js` devem responder com sucesso.
- Abrir `/admin` e `/reset-password` diretamente deve carregar a interface SPA.
- Arquivos de desenvolvimento e configuração privada não devem fazer parte do upload; não publique `.env`, `backend/`, `testes/` ou fontes por meio de outra pasta de assets.

## Ligação com o Laravel

O site usa `/api/v1` por padrão. O Worker executa primeiro nas rotas `/api`, `/api/*`, `/sanctum` e `/sanctum/*`, impedindo que a navegação SPA devolva HTML no lugar de uma API. Encaminha somente `/api/v1/*` (e sua raiz) e `/sanctum/csrf-cookie` ao Laravel; outros caminhos desses namespaces retornam JSON 404.

**Dado ainda necessário:** a URL HTTPS pública do Laravel. O PR de Docker para Render prepara a imagem, mas não comprova que a API foi publicada, configurada ou conectada ao banco. Não há URL de backend fictícia configurada no código.

No Worker **prumo**, em **Settings → Variables and Secrets**, configure a variável de runtime `LARAVEL_ORIGIN` com a origem real da API (protocolo HTTPS e hostname, sem `/api/v1`, caminho, query, usuário ou senha). `keep_vars=true` preserva as variáveis gerenciadas no painel nos deploys seguintes. A URL não é credencial de banco; tokens, APP_KEY e senhas continuam apenas no Laravel.

No build do React, mantenha `VITE_API_BASE_URL=/api/v1` ou ausente. Assim o navegador fala com o mesmo domínio da loja e o Worker faz a ligação HTTP ao servidor Laravel. Não aponte o navegador diretamente para um domínio externo apenas para contornar esse encaminhamento.

### Preparar o Laravel no servidor

Além da URL da API, chave da aplicação estável, banco e migrações homologadas, configure no ambiente Laravel:

```ini
APP_ENV=production
APP_DEBUG=false
LOCAL_TEST_MODE=false
FRONTEND_URL=https://prumo.bernadin15-dev.workers.dev
SANCTUM_STATEFUL_DOMAINS=prumo.bernadin15-dev.workers.dev
SESSION_DOMAIN=null
SESSION_HTTP_ONLY=true
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
```

`APP_URL` deve ser a URL HTTPS real do Laravel. Mantenha a configuração MySQL e credenciais somente no backend. Não altere `APP_KEY` de uma instalação com dados cifrados. O nome de cookie atual deve permanecer estável durante a atualização; o painel mantém o sufixo `_admin_v1` e seu CSRF próprio. O proxy não reescreve atributos Domain: `SESSION_DOMAIN=null` é necessário para cookies por host no endereço público.

Configure `TRUSTED_PROXIES` conforme os IPs/faixas efetivamente usados pelo provedor e valide HTTPS/IP original passando por Cloudflare e Render. Não presuma que `*` seja apropriado. O Worker descarta os cabeçalhos de encaminhamento fornecidos pelo cliente, preserva o Host do origin e usa o IP da plataforma quando há contexto Cloudflare; o backend ainda precisa reconhecer corretamente seus proxies para rate limiting, URLs e auditoria.

Atualize o cache de configuração conforme o procedimento de implantação e teste inicialmente com banco separado/dados fictícios. Configure SMTP e valide confirmação/recuperação de email antes de vendas. Não foram alteradas contas, aplicadas migrações ou configurados serviços reais nesta etapa.

### Comportamento e limites do proxy

- Sem `LARAVEL_ORIGIN` válida, retorna JSON 503 com `API_NOT_CONFIGURED`; a loja estática continua disponível.
- Usa somente o origin configurado pelo operador; parâmetros e cabeçalhos do cliente não escolhem o destino. Exige HTTPS e recusa credenciais embutidas, caminhos, IP literal/localhost e loop para a própria loja.
- Preserva método, corpo, query, cookies, Authorization, Origin/Referer e cabeçalhos CSRF. Preserva `X-Signature` e `X-Request-Id` para o webhook já existente; não faz verificação financeira no Worker.
- Não segue redirecionamentos no servidor. Reescreve Location do próprio backend para a origem pública e mantém redirecionamentos externos HTTPS, como os endpoints de consentimento já existentes. Não envia credenciais automaticamente ao destino de um redirect.
- Preserva Set-Cookie múltiplos e respostas 401/403/419/422/429 do Laravel. API não usa cache compartilhado: requisição `cache=no-store` e resposta `private, no-store`.
- HTML inesperado do origin vira JSON 502; falha de conexão/timeout de 60 segundos vira JSON 503, sem expor detalhes internos. Não repete POST de cadastro/pagamento. Timeout não prova que o servidor cancelou uma operação: consulte o pagamento existente e, em cadastro indeterminado, verifique o acesso antes de cadastrar novamente.

Esta camada não substitui autenticação, CSRF, MFA, Gates, assinatura de webhook ou idempotência do Laravel. Sem backend/URL/banco configurados, cadastro e login continuam indisponíveis. Previews devem usar somente uma API de homologação, sem credenciais/dados de produção; `keep_vars` não configura automaticamente um ambiente isolado.

### Verificação em homologação

1. Na URL do Laravel, conferir `/up` e `/api/v1/products` sem criar contas reais.
2. Pelo Worker, `/api/v1/runtime-config` deve devolver JSON, não HTML; `/sanctum/csrf-cookie` deve devolver 204 e os cookies esperados.
3. Confirmar cookies HttpOnly/Secure e cookie CSRF legível pelo cliente Axios, sem atributo Domain de outro host.
4. Testar cadastro/login/logout/recuperação de um cliente fictício, depois login/MFA/logout administrativo, preservando sessões independentes e recusas de permissão.
5. Validar confirmação de email, URLs assinadas, IP/rate limiting, redirecionamentos, ausência de cache e integrações sandbox. Sem vendas reais durante esse teste.

Testes locais: `npm --prefix testes run test:proxy` exercita o transporte com fetch simulado, sem chamada a Laravel ou provedores. `wrangler deploy --dry-run` valida empacotamento, mas não conecta a API. Não há homologação real concluída.

Documentação oficial: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [routing SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Request/redirect/cache](https://developers.cloudflare.com/workers/runtime-apis/request/) e [Sanctum SPA](https://laravel.com/framework/docs/12.x/sanctum#spa-authentication).
