> **Referência histórica:** a configuração alvo atual é MySQL, conforme solicitação de 31/10/2026. Consulte [MYSQL.md](MYSQL.md). O suporte PostgreSQL existente é preservado, mas não é a configuração de implantação atual.

# PostgreSQL gerenciado

Decisão de 19/10/2026: React na Vercel, Laravel em hospedagem PHP e PostgreSQL gerenciado. Provedores do backend e do banco ainda pendentes. Este documento prepara a configuração; nenhuma conta externa, regra de firewall, backup ou banco de produção foi criado.

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

Sem os provedores escolhidos, ainda faltam: provisionamento, rede privada/allowlist, grants da aplicação/manutenção, TLS validado numa conexão real, migrações e fluxos em PostgreSQL, backups automáticos e restauração comprovada. A preparação local não garante esses controles no servidor.
