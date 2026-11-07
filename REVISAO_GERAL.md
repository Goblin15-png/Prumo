# Revisão inicial — 06/11/2026

Levantamento estático inicial; não equivale a auditoria completa nem homologação.

## Evidências observadas

- Os Dockerfiles da raiz e do backend já instalam pdo_mysql e pdo_pgsql.
- As migrações de perfil cifrado e checkout têm ramificações específicas para PostgreSQL e alternativas para outros drivers. A execução em MySQL ainda precisa ser validada.
- Há pivôs independentes category_product e product_symptom. A categoria guarda sort_order por associação; não é a mesma entidade que a queixa.
- As rotas administrativas usam auth:admin, middleware administrativo e gates por operação. AdminPermissions concede system.view ao técnico e operações comerciais ao proprietário. A documentação que descreve essa segregação apenas como pendente precisa ser reconciliada com testes e comportamento atuais.
- CheckoutService usa transações e lockForUpdate. A correção concorrente não é demonstrada por testes SQLite; requer testes no MySQL.
- A documentação de checkout diverge: AGENTS.md descreve migração futura, mas há TransparentCheckoutTest, rota checkout/transparent e serviço MercadoPagoOrdersService. Isso comprova código existente, sem comprovar homologação do provedor. Nenhum contrato de pagamento foi alterado.

## Ordem da revisão restante

1. Executar a suíte no MySQL e resolver incompatibilidades comprovadas; validar a implantação em banco novo conforme MYSQL.md (HostGator, sem dados a transferir).
2. Conferir login/MFA, recuperação, expiração, CSRF e autorização de cada operação com os testes administrativos e de sessão.
3. Revisar auditoria e efeitos externos, especialmente chamadas dentro de transações, repetição de webhooks e idempotência.
4. Revisar catálogo e UX: múltiplas categorias, múltiplos alvos, seleção única de queixa do cliente e ordenação por categoria.
5. Homologar checkout/frete com adaptadores simulados e depois sandbox, preservando os contratos existentes.
6. Revisar dependências, builds, acessibilidade e estados de erro/responsividade. Decisões de hospedagem e redes dependem do destino confirmado.

## Limitação do ambiente desta etapa

PHP, Node/npm, MySQL e Docker não foram encontrados no PATH e as dependências locais backend/vendor e frontend/node_modules não estavam disponíveis. Build, testes PHP/JavaScript e integração MySQL não puderam ser executados neste terminal. O workflow MySQL foi preparado, mas não foi disparado nem observado aqui.

## Atualização do diagnóstico local

As ferramentas estavam ocultas pelo isolamento do VS Code Flatpak. Consultas via `flatpak-spawn --host` confirmaram PHP 8.4.5 com pdo_mysql/pdo_sqlite, Node 20.18.1, npm 9.2.0 e Docker 29.2.1 acessível. Isso corrige a hipótese inicial de ferramentas ausentes; não significa que builds ou testes já tenham sido executados.

## Validação após instalação das dependências

- Composer concluiu a instalação dos 114 pacotes do lockfile.
- Resolvidos marcadores de conflito em frontend/src/App.jsx e backend/app/Models/User.php, preservando ambos os imports e todos os casts envolvidos.
- Restaurada Database\Factories\UserFactory, exigida por testes existentes; criados diretórios locais de runtime do Laravel. A fixture de sessão administrativa em DistributorWorkspaceTest recebeu a mesma origem usada pelos demais testes administrativos.
- npm audit fix atualizou follow-redirects para 1.16.2 e Vite para 6.4.5; a auditoria retornou zero vulnerabilidades naquele momento. Build Vite concluído e 21 testes JavaScript passaram.
- Suíte PHP em SQLite em memória, com APP_KEY temporária fornecida somente ao processo: 161 testes, 1313 asserções, nenhuma falha ou erro. Permanece um aviso de schema XML antigo do PHPUnit.
- Esses resultados não validam execução em MySQL nem a publicação no Plano M da HostGator, que ainda dependem de homologação.

## Validação MySQL concluída localmente

- Plano de destino confirmado: HostGator M. Versão do banco e capacidades da conta ainda não foram verificadas.
- MySQL 8.4 temporário em Docker, restrito a loopback, sem volumes de dados reais: 162 testes e 1321 asserções passaram. SQLite em memória: 162 testes e 1321 asserções passaram.
- Corrigidas colunas JSON incompatíveis com encrypted:array para TEXT (endereço e recuperação MFA), incluindo migração corretiva para esquemas já existentes. O rollback dessa migração corretiva mantém TEXT intencionalmente; detalhes em MYSQL.md.
- Substituídos triggers de teste específicos de SQLite por injeção de falha de INSERT. O helper mantém a verificação de rollback sem commits implícitos de DDL em MySQL.
- Acrescentado EncryptedArrayStorageTest e atualizado o XML PHPUnit para o schema atual, sem avisos na execução.
- Nenhum banco da HostGator foi acessado; publicação e homologação do servidor continuam pendentes.
