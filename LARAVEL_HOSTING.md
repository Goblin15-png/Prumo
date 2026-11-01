# Loja, painel e API no Laravel — Render

Decisão de 01/11/2026: um único serviço Laravel serve React compilado, painel administrativo, autenticação e API. React continua sendo a interface; não existe servidor Node em produção. Node é usado somente no estágio de build. PostgreSQL permanece privado ao backend. Cloudflare e Vercel não são necessários para este fluxo.

Endereço atual: https://prumo-backend-x6w9.onrender.com

## Campos no Render

No serviço Laravel existente, em Settings/Build & Deploy:

| Campo | Valor |
| --- | --- |
| Runtime | Docker |
| Branch | main |
| Root Directory | vazio (raiz do repositório; remover backend se preenchido) |
| Dockerfile Path | ./Dockerfile (arquivo da raiz) |
| Docker Build Context Directory | . (raiz do repositório, quando houver esse campo) |
| Docker Command | vazio, para usar CMD da imagem |
| Health Check Path | /up |

Não use backend/Dockerfile para a loja completa: ele continua sendo a imagem legada de API isolada, sem o frontend. O Dockerfile da raiz compila frontend, copia dist para backend/public e renomeia index.html para storefront.html. Apache entra por index.php; Laravel serve o HTML apenas em /, /admin, /admin/* e /reset-password. /api e /sanctum continuam sendo rotas Laravel e não recebem fallback da SPA. Arquivos estáticos existentes são servidos por Apache.

O startup atualiza config:cache, aplica migrações pendentes e inicia Apache. Falha em configuração/migração impede inicialização. Não usa migrate:fresh/reset nem altera APP_KEY. Inspecione logs do deploy e migrações pendentes; mantenha backup antes de produção. Não substitua o comando Docker por apache2-foreground, pois isso pula o startup.

## Environment do Laravel

Atualizar os valores abaixo, preservando APP_KEY, conexão PostgreSQL e credenciais SMTP existentes:

```ini
APP_URL=https://prumo-backend-x6w9.onrender.com
FRONTEND_URL=https://prumo-backend-x6w9.onrender.com
SANCTUM_STATEFUL_DOMAINS=prumo-backend-x6w9.onrender.com
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
APP_ENV=production
APP_DEBUG=false
LOCAL_TEST_MODE=false
```

Remover o domínio Cloudflare de FRONTEND_URL e SANCTUM_STATEFUL_DOMAINS. Não criar LARAVEL_ORIGIN, FRONTEND_ORIGIN nem segredos VITE_ no Render. O build fixa VITE_API_BASE_URL=/api/v1. Configure proxies confiáveis conforme a hospedagem, sem confiar indiscriminadamente em cabeçalhos do cliente.

Ao trocar o domínio público, cookies do endereço antigo não migram: clientes e administradores devem entrar novamente. Verificação de email e recuperação continuam no Laravel. Gmail SMTP ainda requer hospedagem/plano com saída SMTP permitida: Render Free bloqueia portas 465/587, conforme EMAIL_CONFIRMATION.md. Esta mudança de frontend não resolve esse bloqueio.

## Publicação e retirada do Cloudflare

1. Incorporar o PR, ajustar os campos/Environment acima e executar Manual Deploy → Deploy latest commit no Render, se o deploy automático não usar a nova configuração. Aguardar Live e revisar os logs de migração.
2. Abrir a raiz do endereço Laravel: deve carregar a loja, não a antiga mensagem JSON da API. Abrir /admin e /reset-password diretamente; conferir assets compilados e login/cookies.
3. Executar `npm --prefix testes run check:deploy` na cópia atualizada do projeto. API deve responder JSON 200 e CSRF 204.
4. Validar cadastro/confirmação com caixa de email controlada, login/logout e MFA administrativo em homologação. Nenhum teste precisa de pagamento real.
5. Depois de validar o Laravel, na conta Cloudflare, desativar builds automáticos/desconectar GitHub do Worker antigo e excluir o Worker prumo se não for mais utilizado. Exclusão do serviço remoto não acontece ao apagar wrangler.json no GitHub. Não remover zonas DNS ou domínios não relacionados.

A conta Render/Cloudflare não foi modificada por esta preparação. A imagem antiga/API isolada não serve a interface nova até mudar o contexto/Dockerfile. Não afirmar publicação concluída apenas porque o PR foi incorporado.

## Testes

Build Vite e testes de demonstração permanecem disponíveis. StorefrontHostingTest usa HTML fictício em pasta temporária, sem dados reais. Workflow GitHub testa PHP e compila Docker sem credenciais, sem publicar imagem ou aplicar migração em produção. O Dockerfile não inclui testes, dependências de desenvolvimento PHP, .env ou credenciais do computador.
