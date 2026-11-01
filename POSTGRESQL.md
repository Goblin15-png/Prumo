# PostgreSQL gerenciado

Confirmado em 01/11/2026: PostgreSQL no Render, Laravel em `https://prumo-backend-x6w9.onrender.com` e frontend Cloudflare em `https://prumo.bernadin15-dev.workers.dev`. As instruções Vercel permanecem para essa alternativa; não substituem a configuração Workers em `CLOUDFLARE.md`. A confirmação não comprova migrações, backups ou fluxos autenticados homologados.

## Configuração específica do Render

Use `backend/.env.render.example` como referência para **Environment do serviço Laravel**. Não copie o arquivo por cima de um ambiente existente nem gere outra APP_KEY se houver dados cifrados.

- `DB_CONNECTION=pgsql` e `DB_URL` com a URL interna atual do banco, preenchida privadamente no Render. O código lê `DB_URL`, não `DATABASE_URL`. A URL interna só é alcançável por serviços Render da mesma conta/região; nunca deve ir ao Cloudflare, React ou variáveis `VITE_*`.
- `DB_SSLMODE=require`: exige TLS para o endpoint interno Render, cujos certificados são autoassinados e não suportam `verify-full`/`verify-ca`. Este é um ajuste por ambiente; o padrão genérico continua `verify-full`. Revise parâmetros `sslmode` da própria URL, que podem prevalecer. [Documentação oficial Render](https://render.com/docs/postgresql-creating-connecting).
- A imagem `backend/Dockerfile` já inclui `pdo_pgsql`; não precisa trocar a stack React/Laravel. React é o frontend, Laravel é o backend.
- A credencial anteriormente compartilhada no chat deve ser rotacionada no Render; atualize o segredo do backend depois. Não copie a credencial antiga para commits, testes ou documentação.
- Configure URLs, Sanctum e cookies do modelo; confirme IPs/CIDRs de proxies com a hospedagem antes de preencher `TRUSTED_PROXIES`. Não use `*` sem análise. Atualize o cache de configuração no processo de implantação existente.

Em verificação pública, `/up`, `/api/v1/runtime-config` e `/api/v1/products` responderam 200; isso não identifica o banco conectado nem comprova cadastro. A paginação de produtos gerou links HTTP apesar da requisição HTTPS: valide `APP_URL` e reconhecimento de proxies antes de homologar confirmação de email/URLs assinadas. Não se aplicou migração nem se criou conta real.


## Acesso e rede

O fluxo é navegador → API Laravel por HTTPS → PostgreSQL. O frontend não acessa o PostgreSQL nem recebe sua URL ou senha.

Escolha os provedores considerando a conectividade entre eles: prefira banco com endpoint privado alcançável pela rede do backend. Se a conexão exigir endpoint público, restrinja o firewall/allowlist aos endereços de saída fixos do backend e exija TLS. Não libere `0.0.0.0/0` ou `::/0`. Acesso administrativo e ferramentas de backup devem ocorrer por canais autorizados e restritos, sem expor o banco ao navegador.

Use credencial da aplicação com privilégios mínimos nas tabelas e sequências necessárias, sem superusuário, criação de roles ou de bancos. Migrações precisam de permissões de DDL: use uma credencial de manutenção restrita ao processo de deploy. O usuário de aplicação precisa operar catálogo, pedidos, sessões, filas e cache, mas não administrar a instância. Os grants exatos serão configurados e testados no provedor escolhido.

## Variáveis somente no servidor Laravel

Exemplo ilustrativo, a preencher no gerenciador de segredos/ambiente da hospedagem. Não substitui o `.env` local nem deve receber valores reais em commits:

```ini
APP_ENV=production
APP_DEBUG=false
LOCAL_TEST_MODE=false

DB_CONNECTION=pgsql
DB_HOST=HOST_INFORMADO_PELO_PROVEDOR
DB_PORT=5432
DB_DATABASE=protocolar
DB_USERNAME=protocolar_app
DB_PASSWORD=SENHA_GERADA_NO_PROVEDOR
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/caminho/no/servidor/ca-do-provedor.crt
```

Instale `pdo_pgsql` no PHP do servidor e use a porta/hostname reais do serviço. A configuração PostgreSQL em `backend/config/database.php` lê `DB_SSLMODE` e os certificados por ambiente. `verify-full` exige criptografia, valida a cadeia do certificado e confere o hostname; a conexão falha quando a validação não passa. Configure a CA conforme as instruções do provedor. `DB_SSLCERT` e `DB_SSLKEY` só são necessários se ele exigir autenticação por certificado de cliente. Referência: [TLS no PostgreSQL](https://www.postgresql.org/docs/current/libpq-ssl.html).

`DB_URL` é uma alternativa às variáveis individuais. Não deixe uma URL antiga configurada: os campos e parâmetros dela podem substituir as opções acima, inclusive o modo TLS. Não use `DB_SSLMODE=disable`, `allow` ou `prefer` no ambiente de produção. Uma conexão PostgreSQL local sem TLS pode usar `disable` explicitamente no seu ambiente de desenvolvimento isolado.

Nenhuma dessas variáveis vai para a Vercel ou recebe prefixo `VITE_`. Proteja também `APP_KEY` e os tokens dos provedores no backend. As variáveis públicas do frontend e a configuração do encaminhamento HTTPS estão em [DEPLOYMENT.md](DEPLOYMENT.md#frontend-na-vercel).

## Migrações e dados existentes

As migrações de criptografia de perfil (`000007`) e campos de checkout (`000011`) foram ajustadas para o PostgreSQL: removem o CHECK antigo antes de cifrar o sexo e alteram a nulabilidade da forma de pagamento preservando o CHECK. Na reversão, a data exige cast explícito. MySQL e SQLite mantêm seus caminhos existentes.

Essas alterações são para migrações ainda não executadas no PostgreSQL; mudar uma migração já registrada não a executa novamente. Não converta o banco atual apenas trocando `DB_CONNECTION`. Se houver dados a preservar, planeje exportação/importação, integridade de vínculos, contagens e sequências, mantendo a `APP_KEY` necessária para ler os dados já cifrados.

Antes da produção, crie um PostgreSQL de homologação separado, aplique as migrações e valide cadastro, login/MFA, catálogo, pedidos, estoque, transações, webhooks e concorrência com integrações sandbox. Use backend/frontend compatíveis. Nenhuma migração foi aplicada a um banco existente nesta preparação.

## Separação dos testes

- A prévia descartável mantém SQLite temporário e dados fictícios; não modifica o `.env` local.
- A suíte `testes/backend/phpunit.xml` força SQLite em memória e apaga `DB_URL` do ambiente do processo para não herdar uma conexão real.
- `PostgresMigrationSqlTest` compila SQL com a implementação PostgreSQL do Laravel, sem conectar. Ele detecta os problemas de SQL tratados nesta etapa, mas não comprova execução de migrações, TLS ou funcionamento dos fluxos num PostgreSQL real.
- A homologação PostgreSQL deverá ter banco/instância, usuários, segredos e backend próprios. Não execute a suíte destrutiva de testes com credenciais de produção. Os previews da Vercel também devem usar somente homologação.

## Backups e restauração

No serviço escolhido, habilite backups automáticos cifrados, acesso restrito e alerta de falhas. Defina com os responsáveis a retenção, frequência, perda de dados aceitável (RPO) e tempo de recuperação (RTO); habilite recuperação para um instante (PITR) se o plano oferecer e isso atender à necessidade da loja. Ainda não há política nem serviço de backup ativo.

Teste a restauração em uma instância isolada antes de abrir vendas e depois periodicamente: restaure um backup recente, confira vínculos, catálogo, pedidos e a leitura dos campos cifrados usando a `APP_KEY` correspondente, protegida separadamente. Desative integrações, emails e jobs com efeitos externos nesse ambiente. Registre duração, resultado e responsável e descarte os dados restaurados conforme a política definida. Não restaure por cima da produção para realizar esse teste.

Uma exportação com `pg_dump` pode complementar os backups gerenciados; não substitui agendamento, retenção, monitoramento nem teste de restauração. Não coloque dumps na pasta pública, no frontend ou no repositório. Referência: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

## Evidência ainda necessária

Com Render escolhido, ainda é necessário comprovar: provisionamento, rede privada/allowlist, grants da aplicação/manutenção, TLS validado numa conexão real, migrações e fluxos em PostgreSQL, backups automáticos e restauração comprovada. A preparação local não garante esses controles no servidor.
