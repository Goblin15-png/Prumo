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

A suíte força SQLite em memória e `DB_URL` vazio, mesmo quando existe uma URL de banco no ambiente. `PostgresMigrationSqlTest` verifica SQL gerado para PostgreSQL sem conexão externa; não substitui homologação em PostgreSQL real. A configuração alvo atual e seus limites estão em [MYSQL.md](../MYSQL.md). `MySqlConfigurationTest` verifica Unicode, modo estrito, verificação TLS quando o driver está disponível e isolamento SQLite, sem abrir conexão MySQL.

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

### Acesso e sessão do painel

Após compilar `frontend/`, execute:

```bash
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-admin-access.mjs
```

O teste inicia seu próprio servidor estático local e intercepta todas as APIs com dados fictícios. Cobre login móvel e teclado, configuração MFA e códigos de recuperação, reinício de desafio expirado, limpeza do painel/formulário após 401/419 ou revogação explícita, distinção de 403 por operação e erro temporário, repetição da verificação inicial, perfil técnico, permissões de métricas/IA, logout sem duplicação, resposta de identidade atrasada, limite de tentativas e solicitação de recuperação de senha. Não valida a criptografia MFA, SMTP nem o backend real. `AdminPermissionsTest` verifica os códigos de reautenticação no Laravel e preserva a distinção em relação aos Gates por operação.

### Recuperação de checkout e frete

`browser/browser-checkout.mjs` contém doze cenários com o build real e API/SDK simulados. Além dos cenários anteriores, verifica repetição de cotação indisponível, invalidação do frete recusado antes de uma nova seleção, retomada de pagamento com sacola vazia após recarga, consulta de pedido já enviado e pago, isolamento de UUID por cliente e funcionamento em memória com `sessionStorage` bloqueado. Retomar/consultar não pode emitir um novo POST de cobrança. Nenhuma requisição financeira ou logística é enviada aos provedores. O teste não homologa Mercado Pago, Melhor Envio, MySQL ou o backend Laravel real.
