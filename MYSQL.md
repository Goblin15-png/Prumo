# Preparação da migração para MySQL

Decisão de 06/11/2026: usar MySQL. O repositório foi preparado; nenhum banco remoto foi acessado ou transferido. O responsável confirmou HostGator como destino e informou que não há dados a preservar. O plano contratado é o Plano M (compartilhado). A versão real do banco na conta, acesso SSH e publicação da aplicação ainda precisam ser confirmados. LARAVEL_HOSTING.md registra a hospedagem anterior, com PostgreSQL.

## Configuração

Use os campos DB_* de backend/.env.example, com usuário próprio da aplicação e banco previamente criado. Não use root. O destino de validação automatizada é MySQL 8.4; sua compatibilidade só estará comprovada após execução dos testes. Os dois Dockerfiles já incluem pdo_mysql; o driver PostgreSQL permanece para permitir a transição.

Se houver DB_URL no ambiente, remova a URL antiga ou substitua-a por uma URL MySQL: ela pode prevalecer sobre os campos individuais. Não envie credenciais pelo chat nem as coloque no Git. Preserve APP_KEY: há dados cifrados que dependem dela.

Para conexão remota configure MYSQL_ATTR_SSL_CA com o caminho do certificado fornecido pelo provedor e homologue TLS/verificação do servidor. Não desative a verificação para contornar falhas. Plano HostGator, rede, certificados e backups ainda precisam ser definidos; esta preparação não altera esses recursos.

A demonstração, a prévia local e a suíte PHPUnit padrão continuam em SQLite isolado, sem cobrança ou envio real. O .env existente não foi alterado. A mudança de padrão em config/database.php afeta ambientes sem DB_CONNECTION explícito: revise essa variável antes de publicar.

## Validação isolada

O workflow .github/workflows/mysql.yml cria um serviço MySQL 8.4 descartável, instala as dependências PHP e executa a suíte com testes/backend/phpunit.mysql.xml. Não usa credenciais de produção. A configuração fixa loopback, banco protocolar_test e uma conta exclusiva com senha fictícia. Não use esse nome/conta para dados que precisem ser preservados: os testes podem recriar tabelas. A suíte padrão mantém SQLite em memória.

Não execute testes contra o banco operacional. Migrações em MySQL podem fazer commits implícitos de DDL; uma transação não garante desfazer alterações de esquema.

## Implantação em banco novo — pendente

Não é necessário transferir dados do banco anterior, conforme confirmação do responsável. Não apagar o banco anterior como parte desta preparação.

1. Confirmar o plano HostGator, versão real do servidor de banco e local de execução do Laravel. Não presumir suporte a Docker, SSH ou conexão externa.
2. Validar as migrações e a suíte em MySQL isolado. O workflow usa MySQL 8.4; comparar com a versão disponibilizada no plano.
3. Criar banco vazio e usuário próprio na hospedagem. Configurar DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME e DB_PASSWORD com os valores fornecidos pelo ambiente; nomes podem incluir prefixos. Não colocar credenciais no repositório.
4. Preparar a publicação conforme os recursos confirmados do plano. Preservar APP_KEY de qualquer ambiente que continue em uso e definir a chave do ambiente novo por procedimento próprio, sem rotacionar chaves implicitamente.
5. No ambiente de destino confirmado, aplicar migrações pendentes com `php artisan migrate --force` e renovar o cache de configuração conforme o procedimento de publicação. Não executar migrate:fresh/reset. O startup Docker existente já executa migrações; só se aplica quando a implantação realmente usar essa imagem.
6. Provisionar contas administrativas individuais pelo comando existente, sem senhas de fixtures ou seeders de demonstração. Homologar catálogo, login, MFA e serviços em sandbox antes da operação comercial.

Nenhum banco remoto foi criado ou acessado nesta etapa. A escolha da HostGator não comprova compatibilidade do plano nem publicação concluída.

## Resultado da validação local

A suíte completa foi executada com PHP 8.4.5 e um MySQL 8.4 descartável via Docker: 162 testes e 1321 asserções passaram. O mesmo resultado passou em SQLite em memória. Isso não comprova compatibilidade com a versão do banco disponível na conta HostGator.

Foram corrigidos dois tipos de coluna: users.two_factor_recovery_codes e orders.shipping_address precisam ser TEXT para receber os casts encrypted:array; JSON nativo rejeita o conteúdo cifrado. A migração 2026_11_06_000018 corrige esquemas que já executaram as versões antigas. Seu down mantém TEXT deliberadamente para não converter ciphertext em JSON inválido; o rollback das migrações de origem continua responsável por remover o MFA ou decifrar endereços antes de restaurar JSON. Não há mudança de contrato da API nem remoção de criptografia.

Os testes de indisponibilidade de auditoria agora simulam erro de INSERT pela conexão Laravel, sem triggers exclusivos de SQLite e sem DDL que faria commit implícito em MySQL. Foi acrescentada regressão para leitura/escrita dos dois arrays cifrados. A configuração XML do PHPUnit foi atualizada e não apresentou o aviso anterior.
