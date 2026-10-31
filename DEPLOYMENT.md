# Preparação para hospedagem pública

O projeto usa Laravel 12 no backend e React/Vite no frontend. A loja definitiva inclui catálogo, cadastro de clientes, painel `/admin` e checkout transparente dentro do site, com Pix e cartão via Orders do Mercado Pago. O backend também possui cotação do Melhor Envio. O código ainda depende de configuração do ambiente, credenciais e testes de ponta a ponta em homologação antes de aceitar vendas. O fluxo Checkout Pro permanece apenas para compatibilidade com pedidos e notificações anteriores; detalhes em [CHECKOUT_TRANSPARENTE.md](CHECKOUT_TRANSPARENTE.md).

É possível preparar a hospedagem e homologar catálogo/painel com pagamento e frete sem credenciais: o pagamento fica indisponível e a cotação informa que ainda não foi configurada. Isso não habilita compras. Não ative `LOCAL_TEST_MODE` em servidor público; a simulação fica no ambiente local isolado de `testes/`.

Decisão de 19/10/2026: frontend React/Vite na **Vercel**, backend Laravel em **hospedagem PHP** e **PostgreSQL gerenciado**, acessado pelo backend. Os provedores do Laravel e do PostgreSQL, domínios e regras de rede ainda não foram escolhidos. Configuração, requisitos de acesso e backups em [POSTGRESQL.md](POSTGRESQL.md). O ambiente local existente não foi convertido nem seus dados migrados.

## Frontend na Vercel

Configure a **Root Directory** como `frontend`, framework **Vite**, build `npm run build` e saída `dist`. O arquivo `frontend/vercel.json` prepara as rotas `/admin/*` e `/reset-password` e os cabeçalhos do frontend. Não publique a raiz do repositório nem a pasta `testes/`.

O navegador continuará chamando `/api/v1`. Após definir a URL HTTPS do Laravel, adicione estas regras ao início de `rewrites` em `frontend/vercel.json`, substituindo `api.example.invalid` pelo host real do backend:

```json
[
  { "source": "/api/v1/:path*", "destination": "https://api.example.invalid/api/v1/:path*" },
  { "source": "/sanctum/:path*", "destination": "https://api.example.invalid/sanctum/:path*" }
]
```

São regras adicionais: preserve as rotas de interface já existentes. Nenhuma URL fictícia foi colocada na configuração ativa. **Até definir e configurar esse encaminhamento, a publicação estática não terá uma API funcional.** O proxy é HTTP para o Laravel; a Vercel não recebe credenciais nem conexão de banco.

Na Vercel, use `VITE_API_BASE_URL=/api/v1` ou deixe-a ausente (padrão de produção). No Laravel, `FRONTEND_URL` deve ser a origem HTTPS real da loja, `APP_URL` a URL HTTPS do backend, `SANCTUM_STATEFUL_DOMAINS` o host da loja sem protocolo e `SESSION_DOMAIN` vazio/nulo para cookies por host no proxy. Preserve `SESSION_HTTP_ONLY=true`, `SESSION_SECURE_COOKIE=true` e `SESSION_SAME_SITE=lax`. Valide cookies, CSRF, MFA, redirecionamentos, IP original/rate limiting e ausência de cache compartilhado nas respostas autenticadas através do proxy em homologação.

Os ambientes Preview da Vercel devem usar backend e PostgreSQL de homologação separados, sem credenciais, integrações ou dados de produção. A origem autorizada no Laravel é exata; configurar a Vercel não autoriza automaticamente todo domínio `*.vercel.app`.

Se for escolhida chamada direta a um subdomínio da API, será preciso configurar domínio próprio compartilhado, CORS e cookies; simplesmente combinar `*.vercel.app` com um backend em outro domínio não atende ao requisito de sessão SPA do Sanctum. Esse caminho também exige encaminhamento local separado para o `<noscript>` do GTM. Referências: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite), [encaminhamento de requisições](https://vercel.com/docs/routing/rewrites) e [sessão SPA do Sanctum](https://laravel.com/framework/docs/12.x/sanctum#spa-authentication).

## Hospedagem e domínio

- Use uma hospedagem com PHP 8.2+, extensão `pdo_pgsql`, Composer e HTTPS, além de worker de filas e agendamento do Laravel.
- Aponte o document root do backend somente para `backend/public`. Nunca publique a raiz do repositório, `.env`, `vendor`, `database` ou arquivos de backup.
- Compile o frontend com `npm ci` e `npm run build` dentro de `frontend`; publique o conteúdo de `frontend/dist` como frontend estático.
- A configuração padrão do frontend chama a API no mesmo domínio em `/api/v1`. Configure o servidor para encaminhar `/api/v1` e `/sanctum` ao Laravel e permitir fallback da navegação SPA. Se frontend e API usarem subdomínios diferentes, defina `VITE_API_BASE_URL` antes do build e configure CORS, `SANCTUM_STATEFUL_DOMAINS` e `SESSION_DOMAIN` para os domínios reais.
- O painel integrado está em `/admin` e também exige fallback SPA. Sua autenticação usa `/api/v1/admin/auth/*`, cookie de sessão próprio e `ADMIN-XSRF-TOKEN`. Publique backend/frontend compatíveis e atualize os caches de configuração/rotas; administradores entram novamente. A separação de sessões não exige migração nova. Contrato em [ADMIN_ACCESS.md](ADMIN_ACCESS.md#sessões-separadas-de-loja-e-painel).
- No servidor do frontend, envie também CSP e `X-Frame-Options: DENY` como cabeçalhos HTTP. A política CSP em uma meta tag não substitui todos os cabeçalhos.
- O GTM usa o contêiner `GTM-5HTKMSRK` após o aceite dos cookies da Meta e do Google. O `<noscript>` no início do `<body>` consulta `/api/v1/tracking/google-tag-manager-noscript`; essa rota precisa ser encaminhada ao Laravel no mesmo domínio da loja. Sem os dois cookies aceitos, ou em páginas administrativas, ela não redireciona ao Google. Em hospedagem com frontend e API em domínios separados, o fallback sem JavaScript permanece inativo até haver encaminhamento equivalente no domínio da loja.
- O Meta Pixel `1636298474539545` já é iniciado por `MetaPixelConsent.jsx` após o aceite. Seu `<noscript>` usa `/api/v1/tracking/meta-pixel-noscript`, com o mesmo encaminhamento ao Laravel, para só redirecionar à imagem `PageView` quando o cookie da Meta estiver aceito e a origem for uma página pública da loja. Sem JavaScript e sem aceite anterior, não há envio à Meta. Mantenha esse Pixel em uma única integração: cadastrar o mesmo `PageView` também no GTM pode duplicar os eventos.

## Perfis administrativos e catálogo

Antes de publicar a versão com as migrações `2026_10_14_000012` e `2026_10_14_000013`, consulte [ADMIN_ACCESS.md](ADMIN_ACCESS.md). Faça backup, aplique as migrações durante a janela de manutenção e atribua explicitamente `owner` ou `technical` às contas administrativas corretas. Contas antigas não recebem acesso comercial automaticamente. A atribuição exige novo login e MFA. Não remova a associação de múltiplas queixas por rollback depois de registrar novos vínculos sem exportá-los antes.

A migração `2026_10_14_000014` cria `category_product`, preservando o vínculo e a posição antigos de cada produto. A partir dela um produto pode pertencer a várias categorias, com ordenação independente. Não faça rollback da tabela depois de criar novas associações sem exportá-las; o campo legado guarda apenas uma categoria.

Demo, fixtures, testes e launcher local ficam em `testes/`, com build próprio em `testes/dist`. A aplicação definitiva não carrega `/__demo`. Publique somente o build `frontend/dist` e a aplicação Laravel necessária ao servidor; não publique `testes/`, `testes/.local/acesso.txt`, bancos temporários ou credenciais de prévia. Os comandos de demonstração estão em [testes/README.md](testes/README.md) e não iniciam um servidor de produção.

## Configuração Laravel

Use `backend/.env.example` como referência das variáveis; seus padrões são de desenvolvimento. Crie o `.env` real no servidor, fora da pasta pública, preencha banco, email e domínios e configure `APP_ENV=production`, `APP_DEBUG=false` e `LOCAL_TEST_MODE=false`. Use URLs HTTPS em `APP_URL` (backend) e `FRONTEND_URL` (loja), origem autorizada para CORS e hosts sem protocolo em `SANCTUM_STATEFUL_DOMAINS`. Links de recuperação usam `FRONTEND_URL`.

Mantenha `SESSION_ENCRYPT=true`, `SESSION_HTTP_ONLY=true` e `SESSION_SAME_SITE=lax` para a configuração prevista. Cookies `Secure` são ativados por padrão em `APP_ENV=production`; confira que não há override `SESSION_SECURE_COOKIE=false`. Em homologação HTTPS com outro nome de ambiente, defina `SESSION_SECURE_COOKIE=true`. Deixe `SESSION_DOMAIN` vazio/nulo no mesmo host; configure o domínio compartilhado somente se a infraestrutura usar subdomínios que precisem compartilhar cookies.

Configure o transporte de email e o remetente real (`MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SCHEME`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` e `MAIL_FROM_NAME`, conforme o transporte escolhido). `MAIL_MAILER=log` não envia mensagens. Teste entrega e links de confirmação/recuperação no endereço final. O email de login do administrador identifica a conta; não substitui a configuração do serviço de envio.

Para testar localmente sem credenciais externas, `LOCAL_TEST_MODE=true` simula a cotação do frete e conclui pedidos sem cobrança. O backend só ativa esse modo quando `APP_ENV=local`; mantenha `LOCAL_TEST_MODE=false` no servidor público. Pedidos de teste não reduzem o estoque.

Se a hospedagem encaminhar tráfego por um proxy ou balanceador, preencha `TRUSTED_PROXIES` com os IPs/faixas CIDR que ela informar. O Laravel usa esses proxies para interpretar os cabeçalhos HTTPS e o IP original do cliente. Deixe vazio se a aplicação receber conexões diretamente; não confie em cabeçalhos encaminhados por proxies desconhecidos.

`APP_KEY` precisa ser gerada uma vez no ambiente de produção antes de executar a migração `000007`, que cifra os dados existentes dos perfis. Depois disso, mantenha a chave estável e protegida: trocar a chave sem configurar a chave anterior torna os dados cifrados ilegíveis. Não copie o banco local já cifrado para um servidor que usa outra `APP_KEY`; transfira somente o catálogo que deseja preservar ou planeje a re-cifragem.

A migração `2026_10_12_000011` também cifra endereços de entrega já existentes. Se houver pedidos antigos, faça backup e mantenha a mesma `APP_KEY` antes de aplicá-la.

Faça backup do banco antes das migrações. A migração `000005` exige redefinição da senha dos administradores existentes e encerra suas sessões; por isso, configure e teste o email primeiro. Para criar uma conta administrativa individual, use `php artisan admin:create proprietario@example.invalid owner` no console autorizado do servidor, substituindo o email fictício pelo correto; use `technical` para o perfil técnico. Nome e senha são solicitados interativamente, com senha oculta. Siga [ADMIN_ACCESS.md](ADMIN_ACCESS.md); não coloque senhas em argumentos, no frontend ou no repositório. Contas da prévia local não são contas do ambiente hospedado.

Se estiver atualizando uma instalação que já recebe tráfego, coloque-a em manutenção ou pause o tráfego enquanto publica o código e executa as migrações. A migração `000007` converte os valores em texto claro para cifrados; versões antigas e novas do código não devem atender requisições durante essa conversão.

Exemplo de instalação no servidor, depois de configurar o `.env`:

```sh
cd backend
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
# Execute apenas na primeira instalação, se APP_KEY ainda estiver vazia.
# php artisan key:generate
php artisan migrate --force
# Crie a conta individual no servidor, conforme ADMIN_ACCESS.md.
# php artisan admin:create proprietario@example.invalid owner
php artisan config:cache
php artisan view:cache

cd ../frontend
npm ci
npm run build
```

Gere `APP_KEY` somente se estiver vazia e antes da migração; em atualização, preserve a chave atual. Se o servidor não tiver Node.js, faça o build em CI ou localmente e envie apenas `frontend/dist`. A hospedagem deve manter `storage` e `bootstrap/cache` graváveis pela aplicação. Se usar uma fila com `QUEUE_CONNECTION=database`, mantenha um worker Laravel ativo.

## Verificação antes de abrir o endereço ao público

- Aplique as migrações pendentes primeiro em homologação com backup e publique backend/frontend compatíveis. A migração `2026_10_14_000015` adiciona status operacionais, revisão e histórico; `2026_10_17_000016` adiciona os campos de Orders e contato de retirada. O painel usa `orders.fulfillment.update` e trata conflitos de edição retornados como 409. A validação local usa SQLite; valide também no banco escolhido para hospedagem.

- Teste cadastro, confirmação e reenvio de email, login, logout, recuperação por email e MFA administrativo no domínio final. A compra é bloqueada no servidor até a confirmação do email do cliente.
- Confira CORS, cookies de sessão, CSRF, HTTPS, cabeçalhos HTTP, imagens, rotas da SPA e permissões de arquivos.
- Confirme que o banco não aceita conexão pública e que existe backup cifrado com restauração testada.
- Aplique primeiro em homologação com banco separado e dados de teste. Não rode testes de segurança ativos contra produção.
- Publique a política de privacidade aprovada pelo responsável da loja e substitua o link provisório `#` em `frontend/src/components/Footer.jsx` antes de abrir o questionário ao público. O documento precisa informar responsável, finalidade, retenção e canal de contato reais. O sistema registra a versão/data do aceite, permite apagar o perfil e cifra os campos no banco; recomendações, métricas e IA só usam perfis com aceite registrado. A migração `2026_10_12_000010` não presume consentimento dos perfis antigos: eles ficam fora dessas funções até o cliente aceitar novamente.
- O cálculo de frete usa a [API de cotação do Melhor Envio](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos) quando `MELHOR_ENVIO_TOKEN`, `STORE_ORIGIN_CEP` e `MELHOR_ENVIO_USER_AGENT` estiverem configurados. Cadastre dimensões em centímetros e peso embalado em quilogramas e valide cotações em sandbox. Veja [MELHOR_ENVIO.md](MELHOR_ENVIO.md) para os passos e a diferença entre o preview simulado e o ambiente integrado.
- Configure `MERCADO_PAGO_ENVIRONMENT=sandbox`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` com credenciais de teste da mesma aplicação. Access Token e secret ficam somente no servidor. Configure o tópico **Order** no provedor para `https://SEU_DOMINIO/api/v1/payments/mercado-pago/webhook`, usando o domínio real do backend; mantenha notificações legadas quando houver pedidos Checkout Pro. `MERCADO_PAGO_WEBHOOK_URL` é usado pelo fluxo legado. O rótulo `sandbox` não transforma credenciais de produção em credenciais de teste.
- O checkout definitivo usa Pix na tela e Card Payment Brick para tokenizar cartão. O backend recalcula preço/frete, reserva estoque e cria Orders; confirma o pagamento por resposta/consulta autenticada ao provedor e valida a assinatura das notificações. Siga [CHECKOUT_TRANSPARENTE.md](CHECKOUT_TRANSPARENTE.md) para configuração, conciliação e limites, incluindo homologação do SDK e fluxos adicionais exigidos pelo emissor.
- Valide primeiro em homologação com credenciais e contas de teste do Mercado Pago. Configure a URL do webhook no painel de desenvolvedores, faça uma compra de teste incluindo aprovação, recusa, duplicação/reenvio da notificação e expiração; confira também estoque, histórico do cliente e painel administrativo. Só depois troque para `MERCADO_PAGO_ENVIRONMENT=production` e credenciais de produção. O fluxo não foi testado contra uma conta real neste ambiente.
- Configure o cron do servidor para executar `php artisan schedule:run` a cada minuto, por exemplo: `* * * * * cd /caminho/para/backend && php artisan schedule:run >> /dev/null 2>&1`. A tarefa de pedidos é agendada a cada 15 minutos; Orders pendentes dependem de conciliação com o provedor, sem liberação automática de reserva de cobrança indeterminada apenas pelo prazo local.
- O questionário de saúde é opcional e separado do cadastro de compra; revise aviso de privacidade, finalidade, consentimento e retenção antes de coletar essas respostas.
- O painel permite acompanhar pedidos pagos e informar manualmente o código de rastreio. Estorno e cancelamento de pagamento ainda são feitos no painel do Mercado Pago; não há ação integrada para estornar. O código de rastreio também é inserido manualmente; a compra de etiquetas e sincronização automática do Melhor Envio não estão integradas.
- O esquema agora armazena peso e dimensões da embalagem; esses campos continuam opcionais para o cadastro, mas cada produto vendável precisa de valores reais antes de aparecer numa cotação.
- O código do Melhor Envio usa um token guardado no ambiente. Autorização/callback OAuth, armazenamento de refresh token e renovação automática ainda não estão implementados; incluir essas etapas antes de depender desse ciclo em produção. Não basta preencher Client ID e Client Secret. A cotação já distingue `MELHOR_ENVIO_ENVIRONMENT=sandbox` de `production`; confira token, CEP de origem e User-Agent de contato reais, conforme [MELHOR_ENVIO.md](MELHOR_ENVIO.md).
- Cadastre catálogo, preços, estoque, imagens e embalagem reais. Se oferecer retirada, configure `STORE_PICKUP_ENABLED=true` e orientações reais em `STORE_PICKUP_INSTRUCTIONS`; a opção fica desabilitada sem essa configuração.
- Não anuncie vendas nem aceite pagamentos até que o fluxo completo tenha sido testado em homologação com credenciais de teste e, depois, validado no ambiente de produção do provedor. O código local implementa o checkout, mas isso não comprova que as credenciais, webhooks, frete ou infraestrutura do domínio estejam configurados corretamente.

## Limites da preparação local

Build e testes locais não validam DNS, certificado, SMTP, banco e permissões do servidor, credenciais de provedores ou recebimento de webhooks no domínio final. O servidor de prévia em `testes/` é temporário e não deve ser exposto como hospedagem. A configuração real, a publicação e a homologação dessas dependências permanecem etapas próprias.
