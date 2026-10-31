# MySQL — Pruma Essential

Decisão de 31/10/2026: preparar Laravel para MySQL, preservando a loja, o painel `/admin` e a prévia/testes com SQLite. A configuração não provisiona banco, não transfere dados e não comprova homologação.

## Configuração do backend

Exige PHP 8.2+, `pdo_mysql`, Composer e MySQL 8.0+ com InnoDB. Copie `backend/.env.example` para um `.env` privado no ambiente escolhido e preencha:

```ini
APP_NAME="Pruma Essential"
DB_CONNECTION=mysql
DB_HOST=HOST_DO_PROVEDOR
DB_PORT=3306
DB_DATABASE=pruma_essential
DB_USERNAME=pruma_app
DB_PASSWORD=SENHA_DEFINIDA_NO_SERVIDOR
DB_CHARSET=utf8mb4
DB_COLLATION=utf8mb4_unicode_ci
MYSQL_ATTR_SSL_CA=/caminho/privado/ca-do-provedor.pem
MYSQL_ATTR_SSL_VERIFY_SERVER_CERT=true
```

Para MySQL local isolado, o campo CA pode ficar vazio. Para conexão remota, configure a CA fornecida pelo provedor e exija TLS no servidor, com verificação de certificado habilitada. Não deixe `DB_URL` antiga definida: ela pode sobrescrever host, credenciais e opções. Nenhuma variável de banco deve ser configurada no frontend/Vercel ou com prefixo `VITE_`.

Use rede privada ou firewall restrito ao backend. Configure usuário da aplicação com privilégios mínimos e credencial de manutenção separada para DDL/migrações. Não exponha a instância à internet irrestrita. Provedor, domínios e credenciais continuam pendentes.

## Instalação e dados existentes

Em homologação, configure `APP_KEY` uma única vez antes das migrações e preserve-a nas atualizações: há campos cifrados. Com dependências instaladas e um banco vazio dedicado, execute no backend:

```sh
php artisan config:clear
php artisan migrate --force
php artisan config:cache
```

Esses comandos são instruções de implantação; não foram executados contra banco real nesta alteração. Não use `migrate:fresh` em uma instalação com dados. Trocar `DB_CONNECTION` não transfere dados de SQLite/PostgreSQL. Se houver dados existentes, planeje exportação/importação, mantenha a chave de criptografia e valide contagens, vínculos, valores monetários, datas e índices antes da troca.

Configure backups cifrados, retenção e restauração em uma instância isolada; preserve a `APP_KEY` separadamente. Homologue migrações, login de cliente e administrador, MFA, permissões, catálogo, estoque, pedidos e concorrência no MySQL com dados fictícios e integrações sandbox antes de liberar vendas. Consulte [DEPLOYMENT.md](DEPLOYMENT.md) e [ADMIN_ACCESS.md](ADMIN_ACCESS.md).

## Testes isolados

A suíte `testes/backend/phpunit.xml` força SQLite em memória e `DB_URL` vazio. A prévia integrada também usa SQLite descartável. Isso permanece independente do `.env.example` MySQL. Testes locais não comprovam conectividade, TLS nem execução das migrações num MySQL real; essa homologação permanece pendente.

## Identidade e compatibilidade

A marca pública é Pruma Essential, incluindo nome da aplicação/remetente, título, cabeçalhos, rodapé e identificação de checkout. O ícone tipográfico não presume um logotipo comercial definitivo. Nenhum domínio ou conta de provedor foi alterado. Identificadores internos de armazenamento, consentimento e integração foram preservados para manter preferências e contratos existentes. Ao alterar `APP_NAME` em um ambiente existente sem `SESSION_COOKIE` explícito, o nome padrão do cookie muda e será necessário entrar novamente. Preserve o valor anterior de `SESSION_COOKIE` se precisar manter seu nome. O painel administrativo e suas rotas/sessões/MFA/permissões continuam existentes; a atualização não cria administradores nem altera credenciais.
