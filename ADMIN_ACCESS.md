# Acesso administrativo

Provisionamento administrativo atualizado em 18/10/2026. O campo `role=admin` permanece compatível; o campo separado `admin_profile` define o perfil. Toda rota operacional administrativa exige sessão administrativa, MFA recente (até oito horas), perfil válido, versão de acesso vigente e um Gate por operação. Login, configuração/desafio MFA, consulta da própria identidade e logout têm controles próprios descritos abaixo.

| Operação | Proprietário (`owner`) | Técnico (`technical`) |
| --- | --- | --- |
| Consultar, criar, editar, excluir blends e alterar estoque | Sim | Não |
| Consultar, criar, editar, excluir, ordenar categorias e atribuir produtos | Sim | Não |
| Consultar e manter ingredientes, tags e queixas/alvos | Sim | Não |
| Consultar pedidos, salvar status operacional e registrar rastreio | Sim | Não |
| Consultar métricas agregadas consentidas e solicitar sugestões de IA | Sim | Não |
| Consultar disponibilidade da API e do banco | Não | Sim |
| Criar administradores ou alterar privilégios pela API | Não existe | Não existe |

As permissões são declaradas em `backend/app/Auth/AdminPermissions.php`, registradas como Gates no provider e exigidas individualmente nas rotas. O frontend recebe `admin_permissions` para apresentar o painel correspondente; a API continua sendo responsável por autorizar cada chamada. O diagnóstico técnico não devolve versões, configurações, endereços de servidores nem dados comerciais.

Salvar status usa `orders.fulfillment.update`, separado de `orders.view` e do endpoint legado `orders.ship`. Exige um pedido com pagamento confirmado, sem pendência de estoque, status compatível com a modalidade e revisão atual. Não confirma cobranças. O histórico é automático, sem motivo digitado; pedido e histórico são gravados na mesma transação. A alteração exige a migração `2026_10_14_000015` antes da publicação do código correspondente.

## Criar a conta administrativa definitiva

As credenciais de `testes/.local/acesso.txt` pertencem ao preview local e não são contas do servidor publicado. Cada responsável deve ter uma conta individual no banco definitivo; a senha será escolhida durante a criação e o código de autenticação será gerado no aplicativo autenticador dessa pessoa.

Depois de configurar o backend no servidor, preservar sua `APP_KEY`, revisar o banco de destino, fazer backup e aplicar as migrações, o operador autorizado do console executa, dentro de `backend`:

```sh
php artisan admin:create proprietario@example.invalid owner
php artisan admin:create tecnico@example.invalid technical
```

Substitua os emails fictícios pelos emails individuais corretos. Execute somente o comando correspondente à conta que deseja criar. O comando pede o nome completo, a senha de 12 a 128 caracteres e sua confirmação. A senha fica oculta no terminal; não é argumento de linha de comando, não é impressa nem gravada em um arquivo de acesso. Ele apresenta o ambiente e pede confirmação antes de criar a conta e o perfil. Use um gerenciador de senhas para guardar a senha escolhida.

O comando exige um terminal interativo. Não aceita `--no-interaction` e não usa `ADMIN_EMAIL` ou `ADMIN_PASSWORD`; funciona com a configuração Laravel em cache. Recusa emails já usados, inclusive por clientes, e não modifica contas existentes. A conta e o registro de auditoria são criados na mesma transação; se a auditoria falhar, a conta também não é criada. A auditoria registra o ID da nova conta e seu perfil, sem senha ou chave MFA. O acesso ao console do servidor deve ficar restrito aos operadores autorizados.

`owner` permite operar o catálogo e os pedidos. `technical` permite o diagnóstico técnico e não dá acesso comercial. O perfil já é atribuído por `admin:create`; não é necessário rodar `admin:assign-profile` depois de uma criação bem-sucedida.

O seeder legado continua disponível para instalações que já o utilizam, mas não é necessário neste procedimento. Ele depende de `ADMIN_EMAIL` e `ADMIN_PASSWORD`, não atribui perfil, não redefine senhas nem promove clientes. Com a configuração em cache, valores disponíveis somente no `.env` não são lidos pelo `env()` do seeder.

## Primeiro acesso, código autenticador e recuperação

1. Abra `https://seu-dominio/admin`, clique em **Acessar painel** e entre com o email individual e a senha escolhida no console.
2. No primeiro acesso, a tela apresenta a **Chave de configuração**. Cadastre-a manualmente no seu aplicativo autenticador como uma conta baseada em tempo. A tela também disponibiliza o endereço `otpauth`; atualmente não exibe um QR Code.
3. Digite o código de seis dígitos exibido no aplicativo e clique em **Ativar 2FA e entrar**. A configuração expira em dez minutos; se necessário, faça login novamente para recomeçar.
4. Guarde os oito códigos de recuperação exibidos antes de continuar. Eles aparecem uma única vez; cada um só pode ser usado uma vez.
5. Nos próximos acessos, use email, senha e o código atual do aplicativo. O código muda a cada 30 segundos. Um código já usado não pode ser reutilizado; aguarde o próximo se precisar entrar novamente. O desafio de login expira em cinco minutos.

O código MFA não é enviado por email e não é uma senha fixa do servidor. Se perder acesso ao aplicativo, use um dos códigos de recuperação no mesmo campo do desafio. Não existe ainda uma tela para trocar o autenticador ou gerar novos códigos de recuperação; a perda de ambos exige um procedimento de recuperação controlado pelo responsável técnico, que não foi implementado como comando ou endpoint público.

Para senha esquecida, use **Esqueci minha senha** e o email cadastrado. A redefinição encerra sessões e revoga tokens da conta, mas mantém o MFA. Depois de definir a nova senha, volte a `/admin` para entrar no painel.

O servidor precisa de email transacional configurado para enviar recuperação de senha e confirmação de clientes. Configure `MAIL_MAILER`, `MAIL_SCHEME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` e `MAIL_FROM_NAME` conforme o serviço escolhido, além de `APP_URL` e `FRONTEND_URL` com os endereços públicos HTTPS. O padrão `MAIL_MAILER=log` não entrega mensagens. Após mudar a configuração, atualize o cache e valide o recebimento e o link de recuperação no domínio de homologação. Configurar o email de login não configura o serviço de envio.

## Atribuição explícita para contas existentes

A migração `2026_10_14_000012` cria perfil inicialmente nulo para contas existentes. O seeder também não presume um perfil. Contas sem perfil podem completar autenticação, mas não têm acesso às operações do painel.

Após revisar o destino, fazer backup e aplicar as migrações no ambiente escolhido, o operador autorizado do servidor pode executar, dentro de `backend`:

```sh
php artisan admin:assign-profile proprietario@example.invalid owner
php artisan admin:assign-profile tecnico@example.invalid technical
```

Substitua os emails fictícios pelas contas administrativas individuais corretas. O comando só aceita administradores existentes e exige confirmação no console. Não cria contas nem promove clientes. Para remover o perfil:

```sh
php artisan admin:assign-profile proprietario@example.invalid none
```

Cada atribuição registra ID da conta e mudança de perfil na auditoria (ator web nulo, origem CLI), revoga tokens, apaga sessões do banco e incrementa a versão de acesso. Sessões em outros drivers também perdem autorização administrativa pela versão conferida em cada requisição. Mesmo atribuir novamente o mesmo perfil exige novo login com MFA. A gravação do perfil e a auditoria usam a mesma transação; falha de auditoria desfaz a alteração.

O comando é uma ferramenta de manutenção do servidor e não um endpoint disponível aos usuários do painel. A segurança do acesso ao console depende da infraestrutura. Proprietários e técnicos usam o contexto administrativo, separado das sessões de clientes; suas permissões continuam distintas.

## Sessões separadas de loja e painel

O painel integrado é aberto em `/admin`, como módulo React separado da loja. Tem seu próprio formulário de entrada, MFA, consulta de sessão e botão **Sair do painel**. A loja oferece o link **Acesso administrativo**. Não carrega Pixel no painel. A demonstração fica em `testes/`, com execução e build próprios, dados em memória e sem chamadas de autenticação; ela não é incluída no build do site.

| Contexto | Cliente | Administrador |
| --- | --- | --- |
| Guard Laravel | `web`, provider restrito a `role=customer` | `admin`, provider restrito a `role=admin` |
| Cookie de sessão HttpOnly | Valor de `SESSION_COOKIE` | Valor de `SESSION_COOKIE` acrescido de `_admin_v1` |
| Cookie CSRF | `XSRF-TOKEN` | `ADMIN-XSRF-TOKEN` |
| Inicializar CSRF | `GET /sanctum/csrf-cookie` | `GET /api/v1/admin/auth/csrf-cookie` |
| Login | `POST /api/v1/login` | `POST /api/v1/admin/auth/login` |
| Identidade | `GET /api/v1/me` | `GET /api/v1/admin/auth/me` |
| Logout | `POST /api/v1/logout` | `POST /api/v1/admin/auth/logout` |

Ambos enviam o respectivo CSRF no cabeçalho `X-XSRF-TOKEN`. O cliente Axios administrativo lê somente `ADMIN-XSRF-TOKEN`; o cliente da loja lê `XSRF-TOKEN`. O servidor escolhe o contexto pelo caminho da rota antes de iniciar a sessão, sem confiar em flags ou perfis enviados pelo navegador. Cada guard usa um objeto de sessão próprio. Cookies de sessão criptografados são vinculados ao nome pelo middleware do Laravel; copiar o valor sob o nome do outro contexto não autentica.

MFA usa `POST /api/v1/admin/auth/two-factor/confirm-setup` e `/verify`. Os antigos endpoints `/api/v1/auth/two-factor/*` foram removidos. Conta administrativa não entra pelo login de cliente, nem cliente pelo administrativo; ambos recebem o mesmo erro genérico de credenciais. A consulta administrativa de identidade exige MFA/perfil/versionamento; o logout exige sessão administrativa, mas permite encerrá-la mesmo com MFA expirado. As operações administrativas usam `auth:admin`, sem aceitar bearer tokens. Os Gates e a auditoria das operações foram preservados.

Login e logout de um contexto não alteram o outro. A recuperação de senha continua no fluxo comum de email, sem autenticar automaticamente; revoga as sessões/tokens da conta recuperada. Não foi criada outra tabela de usuários ou de sessões: o banco continua compartilhado, com IDs e dados de sessão independentes. O prazo de sessão configurado e a validade do MFA foram preservados.

Na atualização, publique frontend e backend compatíveis, atualize os caches de configuração/rotas conforme o procedimento de deploy e garanta fallback SPA em `/admin`. Administradores precisam entrar novamente no painel; a sessão web antiga não autoriza o novo contexto administrativo. Esta separação não exige migração adicional nem outro domínio. O isolamento de sessão no mesmo domínio não cria uma origem de segurança diferente contra XSS; HTTPS, CSP e revisão da aplicação continuam necessários.

## Publicação

A alteração exige migração antes de usar o painel. Planeje a atribuição dos perfis para evitar interrupção prolongada dos operadores. As migrações novas foram executadas em SQLite em memória nos testes; não foram aplicadas ao banco configurado neste checkout, que usa MySQL sem o driver PDO correspondente instalado neste ambiente.

A migração `2026_10_14_000013` adiciona a associação de várias queixas a cada produto, liga nomes legados já cadastrados e preserva textos não cadastrados. Não faça rollback dessa tabela depois de cadastrar múltiplas queixas sem exportar os vínculos: o campo legado guarda somente um alvo para compatibilidade.

## Revisão da interface administrativa — 31/10/2026

O painel identifica a marca Pruma Essential e o perfil da conta, oferece atalhos para as áreas permitidas e mantém catálogo, categorias e queixas em módulos separados. Métricas exigem `health.view` e o assistente exige `insights.generate` também na interface; os Gates do backend permanecem a autoridade.

A identidade é revalidada a cada minuto enquanto a página está visível e ao retornar à aba/janela. Respostas 401/419 ou 403 com `code=ADMIN_REAUTH_REQUIRED`/`ADMIN_ACCESS_CHANGED` removem o conteúdo administrativo e desmontam formulários abertos, exigindo novo login. Uma recusa comum de operação (403 sem esses códigos) ou indisponibilidade temporária não encerra a sessão. A verificação inicial oferece nova tentativa sem recarregar a página. Respostas atrasadas de identidade não restauram o painel após logout ou novo fluxo de entrada.

O logout bloqueia envios duplicados e informa quando não foi possível confirmar o encerramento no servidor. Essas medidas de interface não substituem a expiração e a revogação de sessão no backend, nem removem dados já vistos pelo operador.

O diálogo de autenticação tem rótulos associados, foco contido, retorno ao botão de origem e rolagem interna em telas pequenas. Escape fecha quando não há envio em andamento nem códigos de recuperação aguardando confirmação. MFA expirado permite **Recomeçar acesso** com email preservado e senha/códigos limpos; senha e chave de configuração deixam de ser necessárias na interface após a etapa correspondente. Não há cadastro público de administradores.

A verificação de navegador `testes/browser/browser-admin-access.mjs` usa o build real com API inteiramente simulada, sem chamadas externas. Ela não comprova autenticação Laravel, entrega de emails, validade criptográfica do MFA ou execução no MySQL. Execute também os testes PHP e a integração real isolada antes da homologação.

## Revisão do catálogo — 31/10/2026

O cadastro/edição de blends aceita dimensões de embalagem com duas casas decimais em centímetros e peso com três casas decimais em quilogramas, conforme a precisão já usada no banco. Medidas como 8 cm e 0,125 kg não são rejeitadas pelo incremento do campo. Estoque exige número inteiro e não é truncado ao digitar; preço, estoque, medidas e peso seguem os limites já declarados pelo servidor. Preço e estoque zero continuam permitidos pelo contrato atual e embalagem continua opcional no cadastro.

Se as opções de ingredientes/tags/queixas falharem, o formulário oferece nova tentativa e bloqueia o salvamento até carregá-las. Durante o envio, os campos e botões de fechamento ficam bloqueados; eventos duplicados de envio são ignorados. Erros de validação aparecem como alerta e preservam os valores para correção. Um ingrediente já selecionado em outra linha fica indisponível para impedir duplicação; a API mantém a validação autoritativa.

A listagem distingue carregamento, falha e catálogo vazio, permite atualização manual e avisa sobre estoque indisponível, preço zero e embalagem incompleta. Esses avisos são informativos: não constituem homologação de venda, aprovação comercial nem garantia de frete. A área de categorias e a seleção múltipla de queixas permanecem separadas do cadastro de blend.

A verificação `testes/browser/browser-admin-catalog.mjs` usa dados fictícios e APIs interceptadas. Ela cobre embalagem, números inválidos, recuperação de falhas, prevenção de duplicação e apresentação operacional; não valida persistência Laravel/MySQL.
