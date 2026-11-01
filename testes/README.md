# Demonstração e testes

Todo o código próprio de demonstração, fixtures, testes e prévias descartáveis fica nesta pasta. `frontend/` contém a loja e o painel reais; `backend/` contém a API Laravel. O build do site não importa a demo nem oferece a entrada `/__demo`.

## Organização

- `demo/`: telas, adaptadores em memória, dados fictícios e testes unitários da demo.
- `browser/`: verificações de interface com Playwright, incluindo integração com Laravel isolado.
- `backend/`: testes Unit/Feature, configuração PHPUnit e ferramentas Browser com SQLite temporário.
- `scripts/local-preview.mjs`: prévia integrada descartável, sem serviços externos.
- `vite.config.js` e `index.html`: entrada e build exclusivos da demonstração.

Os componentes reais são reaproveitados de `../frontend/src/components`, sem duplicação. Mantenha as três pastas lado a lado. As dependências continuam em `frontend/node_modules` e `backend/vendor`; não execute `npm install` nesta pasta. Depois de instalar/atualizar dependências PHP, o Composer registra `Tests\\` a partir de `../testes/backend/`.

## Comandos a partir da raiz

```bash
npm --prefix testes run dev        # demo visual: http://127.0.0.1:4174/
npm --prefix testes run build      # gera somente testes/dist
npm --prefix testes run preview    # serve a demo compilada na porta 4174
npm --prefix testes test           # testes unitários JavaScript
npm --prefix testes run test:php   # suíte Laravel, SQLite em memória
npm --prefix testes run local      # loja/API com fixtures: http://127.0.0.1:4180/
npm --prefix frontend run build    # build exclusivo da loja e painel
```

Para executar PHP diretamente: dentro de `backend/`, use `php vendor/bin/phpunit --configuration ../testes/backend/phpunit.xml`. A configuração PHPUnit fica fora do backend; Use o comando acima em vez de `php artisan test`, pois o wrapper do Artisan procura a configuração na pasta do backend.

A suíte força SQLite em memória e `DB_URL` vazio, mesmo quando existe uma URL de banco no ambiente. `PostgresMigrationSqlTest` verifica SQL gerado para PostgreSQL sem conexão externa; não substitui homologação em PostgreSQL real. A configuração de produção e seus limites estão em [POSTGRESQL.md](../POSTGRESQL.md).

A demo visual não exige backend, cadastro ou dados reais. Os dados são fictícios, as alterações ficam em memória e se perdem ao recarregar. A preferência de tema fica em cookie. A prévia integrada cria um SQLite novo em diretório temporário e bloqueia serviços externos; Ctrl+C encerra e descarta os dados. A demo visual deve ser iniciada separadamente na porta 4174.

## Navegador

Playwright e Chromium precisam estar disponíveis externamente. Não são dependências do site. Exemplos, com caminhos ajustados à instalação local:

```bash
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-demo-standalone.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-integrated.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-orders-refresh.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-pixel-consent.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-tag-manager.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-smoke.mjs
```

O teste standalone exige a demo na porta 4174. O smoke exige tanto a loja compilada na porta 4173 quanto a demo na porta 4174 (`SMOKE_BASE_URL` e `DEMO_BASE_URL` permitem mudar os endereços locais). O integrado inicia seu próprio servidor PHP e exige o build da loja. Nenhum desses comandos certifica integrações de produção.

O teste `browser-orders-refresh.mjs` também inicia Laravel e SQLite próprios, com pagamento simulado e rede externa bloqueada. Confere compra na interface chegando ao painel já aberto, consulta periódica com filtros, pausa durante edição e descarte de respostas atrasadas. Não usa o banco nem as contas da prévia em andamento.

O teste `browser-pixel-consent.mjs` usa o build da loja e origens HTTP/HTTPS interceptadas, com API e SDK fictícios. Confere preferência em cookie por um ano, aceite/recusa, migração do armazenamento anterior, sincronização entre abas, bloqueio de cookies e imagem `<noscript>` consultando a rota local com JavaScript desativado. `MetaPixelNoscriptTest` verifica o redirecionamento condicionado ao aceite, o bloqueio no painel e a URL fixa do evento. Nenhuma conexão ou evento é enviado à Meta nesses testes.

O teste `browser-tag-manager.mjs` confere o carregador GTM no `<head>`, consentimento padrão negado, autorização antes da inicialização, cookies, revogação, isolamento das rotas administrativas e CSP. As requisições de Google e Meta são interceptadas localmente; nenhum evento vai aos provedores.

Checkout definitivo: `browser/browser-checkout.mjs` inicia um servidor local do build da loja e simula API/SDK somente no teste. Use as mesmas variáveis `PLAYWRIGHT_MODULE`/`PLAYWRIGHT_BROWSERS_PATH` dos demais testes. Não precisa iniciar a demo. `browser/run-smoke.mjs` inicia e encerra as prévias 4173/4174 para executar a suíte visual existente.

A prévia `npm --prefix testes run local` habilita pagamento/frete simulados e retirada fictícia somente no banco temporário. O terminal informa o arquivo privado `customer-access.txt` para entrar com a conta fictícia existente. A suíte integrada continua com essa simulação desativada por padrão.

As credenciais da prévia também ficam em `testes/.local/acesso.txt`, atualizado a cada inicialização. A pasta é ignorada pelo Git e o arquivo é privado; contém somente os acessos das contas fictícias, sem a chave da aplicação ou o segredo MFA. Esses acessos deixam de valer quando a prévia é encerrada.

O preenchimento por CEP também pode ser experimentado nessa prévia: digite `00000-000` no checkout para obter rua, bairro, cidade e UF fictícios. Outros CEPs retornam não encontrado; nenhuma consulta externa é enviada. O adaptador simulado fica exclusivamente em `backend/Browser/environment.php` nesta pasta.

Para consultar **CEPs reais pelo ViaCEP**, execute `npm --prefix testes run local -- --real-cep` (ou `npm --prefix testes run local -- 4181 --real-cep` para outra porta). Essa opção libera apenas consultas de endereço ao ViaCEP; catálogo, contas, frete e pagamento continuam simulados, sem cobranças ou etiquetas. O aviso na tela identifica essa diferença. O site definitivo usa ViaCEP por padrão; Correios oficial continua disponível por configuração em `../CORREIOS_CEP.md`. O Melhor Envio real é configurado separadamente conforme `../MELHOR_ENVIO.md`.

`browser/browser-postal-code-live.mjs` confere o preenchimento no navegador usando a prévia `--real-cep` na porta 4180 e o CEP público de exemplo do ViaCEP (`01001-000`). Esse teste é optativo, exige rede e não cria pedidos; use as mesmas variáveis do Playwright dos demais testes. A suíte automática habitual continua isolada.

## Diagnóstico público após deploy

Com Node 22+, execute `npm --prefix testes run check:deploy`. Opcionalmente informe a origem HTTPS única: `npm --prefix testes run check:deploy -- https://SITE`. O comando faz somente GET de runtime-config e CSRF, sem criar contas ou consultar diretamente o banco. Não segue redirecionamentos, não reutiliza cookies e não imprime seus valores. CSRF pode inicializar uma sessão anônima no Laravel. Código de saída 1 indica falha de rede/contrato/configuração; não comprova falha do banco. Um resultado positivo também não homologa cadastro, email ou MFA.

O padrão é o domínio Laravel informado pela equipe. Para homologação use o domínio Laravel de homologação. `npm --prefix testes run test:deploy` testa o diagnóstico com respostas fictícias, sem rede.

## Confirmação de email por código

Configuração de Gmail e limites do Render em [EMAIL_CONFIRMATION.md](../EMAIL_CONFIRMATION.md). `EmailVerificationCodeTest` cobre hash/ocultação, conta destinatária, confirmação, expiração, tentativas, cooldown e falha de entrega. Para PHP: `npm --prefix testes run test:php -- --filter 'EmailVerificationCodeTest|SecurityControlsTest'`.

Com build da loja e Playwright externo: `PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-email-confirmation.mjs`. O teste inicia um servidor temporário, bloqueia conexões externas e usa API fictícia para verificar reenvio, erro e atualização da conta confirmada. Nenhum email real é enviado.

## Loja servida pelo Laravel

`StorefrontHostingTest` verifica rotas de loja/painel/reset, ausência de build, isolamento de API/arquivos e recuperação no domínio configurado. O workflow também compila a imagem Docker unificada e verifica que HTML, assets e index.php estão presentes sem fontes de testes ou .env. `LARAVEL_HOSTING.md` descreve o contexto de build.
