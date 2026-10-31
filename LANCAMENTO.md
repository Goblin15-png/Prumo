# Acompanhamento do lançamento

Decisão de infraestrutura em 19/10/2026: frontend na Vercel, backend Laravel em hospedagem PHP e PostgreSQL gerenciado. Provedores do backend/banco ainda não escolhidos. Preparação atual em [DEPLOYMENT.md](DEPLOYMENT.md) e [POSTGRESQL.md](POSTGRESQL.md). As referências a MySQL abaixo descrevem o ambiente e as validações históricos, não o destino de produção escolhido.

Organização em 17/10/2026: demo, testes JavaScript/PHP e prévia descartável centralizados em `testes/`. A loja não carrega mais `/__demo`. Comandos atuais em [testes/README.md](testes/README.md); os registros abaixo descrevem validações históricas.

Diagnóstico inicial realizado em 14/10/2026. Este registro não certifica prontidão para produção.

Estado mais recente, 15/10/2026: 79 testes PHP passaram, 660 asserções; build, testes do frontend e duas suítes Chromium aprovados. Loja e painel `/admin` têm sessões, cookies, CSRF e login/logout independentes, validados no mesmo navegador contra Laravel e SQLite temporário. O fluxo de pedidos também passou: login/MFA, alteração e retorno de status, persistência após recarga e leitura pelo cliente. A migração 000015 foi executada somente em SQLite nos testes e precisa ser aplicada em homologação; a separação de sessões não exige migração adicional. Retirada no checkout, nome persistido de quem retira, checkout transparente, etiquetas e sincronização de envio continuam pendentes. O banco configurado não foi migrado nesta revisão. Contrato e próximas etapas em [INTEGRACAO_PEDIDOS.md](INTEGRACAO_PEDIDOS.md).

## Modo escuro — 15/10/2026

- Botão de lua/sol no topo da loja, painel e demonstração. O padrão é claro, independentemente do sistema. A escolha explícita guarda somente `light`/`dark` no cookie `protocolo-theme`, com validade de um ano, `Path=/`, `SameSite=Lax` e `Secure` em HTTPS. A preferência anterior do localStorage não é mais usada. A escolha vale entre as páginas; BroadcastChannel sincroniza abas da mesma origem, com releitura do cookie ao retornar à aba como alternativa. Com cookies bloqueados, a troca funciona durante a visita; ausência ou valor inválido inicia no claro.
- Paleta central em `frontend/src/index.css`, com cores semânticas para fundos, texto, bordas, imagens não cadastradas, avisos, erros e sucesso. Aplicada aos componentes de catálogo, conta, pedidos, checkout, formulários/modais e administração. Imagens de produtos preservam suas cores. O menu móvel começa alinhado à esquerda, mantendo Início acessível com o novo botão.
- Novos `ThemeProvider.jsx`, `ThemeToggle.jsx` e `public/theme-init.js`; inicialização no HTML antes do React, usando arquivo externo compatível com a CSP. Ajustes em main, Navbar, AdminApp, DemoStudio e classes de apresentação dos componentes. O aviso do servidor isolado de testes também usa a paleta. Não há alteração de autenticação, banco, regras de negócio ou adaptadores demo/real.
- Validação inicial: build Vite, três arquivos de testes do frontend e 79 testes PHP/660 asserções passaram. Amostras de títulos e campos tiveram contraste mínimo de 4,5:1 conferido por estilo computado. Capturas de catálogo, loja, login, checkout e painel em desktop/celular foram inspecionadas. Isso não é uma auditoria completa de acessibilidade nem valida outros navegadores. A suíte Chromium foi atualizada para verificar claro por padrão mesmo em sistema escuro, cookie persistente, mudança por teclado/clique, recarga, sincronização entre abas/loja/painel/demo, preferência inválida e cookies bloqueados.
- A suíte integrada contra Laravel/SQLite temporário também passou em modo escuro, incluindo catálogo, login, MFA, sessões independentes e pedidos. A demo permaneceu sem API real e as suítes de navegador encerraram sem erros JavaScript. Capturas fictícias em `/tmp/protocolar-smoke/theme-*.png`. Para ver o tema, recarregue a loja e use o ícone no cabeçalho; a prévia integrada continua sendo iniciada pelo comando abaixo.
- Revisão do cookie e padrão claro: build, três arquivos de testes do frontend e ambas as suítes Chromium passaram novamente. Arquivos ajustados: `ThemeProvider.jsx`, `public/theme-init.js`, testes de navegador e este registro. A suíte PHP não foi repetida nesta revisão de apresentação; o backend não foi alterado.

## Abrir a prévia integrada sem configurar MySQL

Para ver somente a demonstração com todas as abas, use a entrada dedicada em [`testes/README.md`](testes/README.md): `npm --prefix testes run dev`, endereço `http://127.0.0.1:4174/`. Ela compartilha os componentes visuais do frontend e não inicia o backend. Build da demonstração e da loja, testes do frontend e `testes/browser/browser-demo-standalone.mjs` passaram; Chromium validou sete abas, recarga, modo claro/escuro, ausência de transbordamento móvel e nenhuma chamada à API. O backend não foi alterado e a suíte PHP não foi repetida para esta entrada visual.

Da raiz do projeto:

```bash
npm --prefix testes run local
```

Requer dependências já instaladas, Node/npm e PHP com PDO SQLite. Compila o frontend com API relativa, cria um banco novo e privado em `/tmp` com produtos, duas categorias, contas e pedidos fictícios e inicia Laravel/loja no mesmo endereço: `http://127.0.0.1:4180/`. Painel em `/admin`; demonstração visual em servidor separado na porta 4174. Para outra porta: `npm --prefix testes run local -- 4181`.

Essa opção foi escolhida para corrigir a visualização local após confirmar HTTP 500 em `/products` e `/categories`: o `.env` aponta para MySQL, mas o PHP não dispõe do driver, e não foi encontrado servidor MySQL local ativo. A prévia Vite da porta 4173 também devolve 404 para `/api/v1/products`, pois não oferece backend por si só. O comando novo não altera `.env`, não instala MySQL e não migra nem conecta o banco configurado.

O aviso na página identifica dados fictícios em banco temporário. HTTP externo é bloqueado, credenciais de provedores não são carregadas, email é mantido em memória e nenhuma cobrança/envio é criado. MFA/CSRF continuam ativos e os cookies são exclusivos da execução. O terminal informa o caminho de um arquivo privado com credenciais aleatórias das contas fictícias; os valores não são impressos. Não use cadastro ou dados reais nessa prévia.

**Ctrl+C encerra o servidor e descarta os dados da execução.** Alterações feitas no catálogo/pedidos dessa prévia são temporárias. A demo na porta 4174 mantém seu adaptador independente em memória. O launcher está em `testes/scripts/local-preview.mjs` e usa as fixtures/servidor de `testes/backend/Browser/`; não publique essas ferramentas como servidor público.

Validação em 15/10/2026: prévia 4180 conferida em Chromium desktop/celular, com `/products` e `/categories` respondendo HTTP 200, dois grupos visíveis, ausência dos erros da captura e acesso à entrada administrativa. Build, testes do frontend, 79 testes PHP/660 asserções e suíte integrada de login/MFA/sessões/pedidos passaram. Formatação PHP e sintaxe do launcher conferidas. O hash do `.env` foi comparado antes/depois e permaneceu igual. Arquivos alterados: novo launcher, script `local` em `frontend/package.json`, fixtures de categorias/produtos em `testes/backend/Browser/environment.php`, asserções do catálogo no teste integrado, comentários de orientação em `.env.example` e este registro.

## Correções e verificações locais

- Dependências PHP reinstaladas a partir do composer.lock existente. A pasta vendor anterior continha Laravel 11.57 e não continha pragmarx/google2fa; o lock instala Laravel 12.69.3 e Google2FA 9.1.0. Nenhuma nova dependência foi escolhida.
- Fixtures de sessão administrativa atualizadas com a data de confirmação MFA exigida pelo middleware; a proteção permaneceu ativa.
- Fixture de cadastro atualizada para enviar confirmação de senha, já enviada pelo frontend e exigida pelo backend.
- Adicionados testes para MFA sem data/expirado e confirmação de senha ausente/divergente.
- Removida variável SESSION_DRIVER duplicada em backend/phpunit.xml.
- php artisan test: 34 testes passaram, 186 asserções, usando SQLite em memória.
- npm run build: passou; artefatos em frontend/dist regenerados.
- node --test testes/demo/demoModel.test.js: passou.
- Pint executado no arquivo de testes alterado.

## Pendências confirmadas ou ainda sem evidência

- Administração: perfis técnico/proprietário e Gates por operação implementados e testados. Aplicar migração e atribuir perfis no ambiente de destino conforme ADMIN_ACCESS.md. Técnico não acessa dados comerciais ou métricas de saúde.
- Sessões: separação de loja/painel, MFA, cookies HttpOnly, CSRF cruzado e logout independente validados no navegador local. Ainda validar expiração, recuperação e configuração no domínio final, incluindo HTTPS/email; os testes locais não certificam o ambiente público.
- Interface: demonstração validada em Chromium com viewport desktop/celular; formulário real e painel técnico validados com API interceptada. Pedidos e login/MFA também validados contra Laravel e SQLite temporário. Ainda revisar acessibilidade por teclado, demais navegadores, cadastro/perfil e compra completa no ambiente de homologação.
- Catálogo: múltiplas queixas, ingredientes, associação explícita de categoria e ordenação verificados em testes. Busca/recomendações/métricas consideram alvos secundários; migração conserva textos legados. Falta validar operação integrada no banco escolhido.
- Pagamentos: código atual usa Checkout Pro. O objetivo de checkout transparente permanece pendente e exige contrato/plano na trilha de pagamentos antes de alteração transversal.
- Homologação: testar Mercado Pago e Melhor Envio com credenciais de teste, incluindo notificações repetidas, falhas, expiração e estoque. Nenhuma chamada real aos provedores foi realizada nesta etapa.
- Operação: confirmar processo de expedição, etiquetas, rastreio, estornos e conciliação.
- Conteúdo: validar dados de catálogo, embalagem e documentos de privacidade com o responsável da loja.
- Infraestrutura: definir hospedagem na trilha apropriada; validar HTTPS, email, domínio, banco privado, backups/restauração, filas e agendamento antes da abertura pública.
- Versionamento: a pasta atual não é um repositório Git. Não há histórico local para conferir diferenças ou fazer rollback por commit.

## Ordem de trabalho

1. Concluir revisão de autorização administrativa e contratos entre frontend/backend.
2. Validar fluxos visuais e corrigir regressões com fixtures.
3. Coordenar contrato do checkout transparente e homologar integrações.
4. Preparar homologação na infraestrutura definida e registrar evidências de ponta a ponta.
5. Liberar vendas somente após resolver bloqueadores e validar a operação com os responsáveis.

## Avanços de 14/10/2026 — segunda etapa

- Perfis administrativos separados, Gates em todas as operações e painel correspondente. Atribuição por comando auditado, sem promover clientes, com revogação de tokens/sessões e versão de acesso para todos os drivers.
- Relação produto/queixas múltiplas, formulário com checkboxes, compatibilidade com alvo legado e validação de IDs. Categorias são proibidas no payload de criação/edição do blend; atribuição continua na área própria.
- Busca, recomendações, detalhes e métricas atualizados; testes de migração, ordenação, exclusão de categoria preservando produtos e falha de auditoria com rollback.
- `/__demo` restaurado na entrada React, carregado separadamente da aplicação integrada. Nenhuma chamada à API foi observada nos fluxos testados.
- Campo de imagens agora mantém múltiplas linhas durante a edição. Inclusão de ingrediente evita adicionar novamente o primeiro item já selecionado. Mensagens de falha de ordenação persistem após recarregar a lista.
- Loja mostra carregamento, falha e tentativa novamente do catálogo. Preferências de cookies funcionam com localStorage bloqueado. Favicon aponta para o arquivo existente.
- `.gitignore` na raiz protege segredos, bancos locais, dependências e arquivos gerados contra inclusão acidental futura; não cria histórico nem remove dados já compartilhados.
- Validação final: 57 testes PHP, 356 asserções; build e teste do modelo demo passaram. Auditorias npm/Composer sem vulnerabilidades reportadas. Testes de navegador passaram com fixtures e API interceptada.
- Arquivos centrais: `backend/app/Auth/AdminPermissions.php`, Gates/provider/rotas/middleware, controllers de autenticação/catálogo, modelos User/Product, comando AssignAdminProfile, duas migrações, três novas suítes de testes e fixtures da suíte anterior; entrada React, App, painéis/formulário de produtos/categorias, modal de produto, consentimento, index.html, package.json e teste opcional de navegador. Detalhes de implantação em ADMIN_ACCESS.md, DEPLOYMENT.md e SECURITY.md.

### Limitação do ambiente integrado

`php artisan env` confirmou ambiente local, mas o banco configurado é MySQL e o PHP disponível não tem PDO MySQL. `migrate:status` falhou antes de consultar o banco. Não houve migração, alteração de contas nem troca do banco configurado. O laboratório visual funciona sem esse backend. Para validar a aplicação integrada, definir/restaurar o banco local e o driver correspondente; nenhuma instalação de serviço foi feita.

### Repetir a validação de navegador

O teste está em `testes/browser/browser-smoke.mjs`. Só aceita URL local e intercepta chamadas de API; não deve ser usado para certificar serviços reais. Playwright foi instalado fora do projeto, em `/tmp`, sem alterar dependências do aplicativo. Com o build pronto, inicie `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` dentro de `frontend` e execute da raiz:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/protocolar-browsers PLAYWRIGHT_MODULE=/tmp/protocolar-browser/node_modules/playwright/index.mjs node testes/browser/browser-smoke.mjs
```

Esses diretórios temporários precisam existir; em outra máquina, instale Playwright/Chromium em ambiente de testes e ajuste os caminhos. Screenshots fictícios desta execução: `/tmp/protocolar-smoke/`. Fontes e recursos externos são bloqueados no teste, portanto a aparência usa as fontes alternativas locais.

## Painel comercial — categorias múltiplas e público

Escopo confirmado: origem significa **canal de aquisição**; gestão de pedidos significa **consultar, filtrar e informar rastreio**. Nenhum novo dado de localização foi coletado e não foram acrescentadas ações financeiras.

- Produtos podem pertencer a várias categorias. Atribuir é cumulativo e idempotente; reordenar afeta somente o vínculo naquela categoria. Há ação para remover apenas um vínculo. Excluir categoria preserva produtos e demais associações; excluir produto remove seus vínculos.
- Nova migração: `2026_10_14_000014_create_category_product_table.php`, com cópia das associações e posições legadas. Campos `category_id`/`category_position` permanecem como compatibilidade; `categories[].pivot.sort_order` representa a ordem em cada categoria. A criação/edição de blend continua sem seletor e rejeita categorias no payload.
- Área própria de ingredientes no painel, além da criação existente no formulário de blend. Criação/exclusão de produtos e categorias e manutenção de queixas/alvos continuam disponíveis ao proprietário.
- `AudienceMetricsService` reúne as contagens usadas pelo relatório e pelo Andromeda: queixa principal, canal de aquisição, sexo/gênero informado, faixa etária e cruzamentos entre cada recorte e queixa. Conta a resposta mais recente de cada conta, somente se consentida. Datas de nascimento são convertidas em faixas dentro do backend; nomes, contatos, emails e datas exatas não compõem o payload da IA. Textos de queixas não cadastradas são agrupados em Other.
- Grupos abaixo de cinco respostas são omitidos em cada distribuição e cruzamento; o painel informa a supressão e oferece atualização manual. Não há consulta a prontuário nem diagnóstico. A base continua sendo o questionário opcional, atualmente com uma queixa principal por pessoa.
- O Andromeda recebe a mesma base agregada do painel, mantendo instruções para tratar rótulos como dados não confiáveis. Pode devolver uma síntese de público e ideias editoriais; a saída continua marcada como não verificada. Nenhuma chamada externa real foi feita nesta validação.
- Pedidos: busca por número/nome/email, filtro por situação, paginação de 25 itens e salvamento de rastreio para pedidos pagos/enviados, com validação, bloqueio de concorrência no registro e auditoria. Não é possível marcar pagamento como confirmado pela interface.
- Visualização: relatório e categorias múltiplas na demonstração; painel completo exercitado com API interceptada, incluindo cadastro de ingrediente, remoção de vínculo, filtros/paginação e rastreio, em 390px e 1440px.
- Arquivos principais: modelos Category/Product; AdminController/ProductController/OrderController/GeminiController; novo AudienceMetricsService; migração 000014 e rotas; App/AdminCategoryManager/AdminCatalogManager/AdminDashboard/AdminOrderManager; novo AdminAudienceReport; fixtures/demo e teste de navegador; nova suíte AdminCommerceTest e atualização de CatalogRulesTest. AGENTS.md atualizado para registrar categorias múltiplas.
- Testes: 64 testes PHP passaram, 441 asserções; build e teste do modelo demo passaram. Migrações verificadas em SQLite de testes; o MySQL configurado permanece indisponível por ausência do driver local e não foi alterado. A aplicação integrada e a chamada ao provedor Gemini ainda dependem de homologação.

### Contratos acrescentados

- Produtos públicos/administrativos retornam `categories` com a posição no vínculo. O filtro público `category=slug` usa o vínculo e respeita a ordem daquela categoria.
- `POST /api/v1/admin/categories/{id}/products` adiciona sem remover categorias anteriores. `DELETE /api/v1/admin/categories/{id}/products/{productId}` remove somente aquele vínculo. Ambas exigem `categories.assign`; ordenação permanece protegida por `categories.order`.
- `GET /api/v1/admin/health-metrics` mantém campos anteriores e inclui `minimum_group_size`, `audience` (acquisition/gender/age), `complaint_by_audience` e contagens de queixas. O payload enviado ao Andromeda contém apenas os grupos permitidos dessas mesmas estruturas.
- `GET /api/v1/admin/orders?search=...&status=...&page=...` mantém `data` e acrescenta `meta.current_page`, `meta.last_page`, `meta.total`. Pesquisa tem limite de 120 caracteres e situações aceitas são pending/paid/shipped/cancelled.

## Fluxos visíveis de edição, fotos, ingredientes e exclusão

- A prévia antiga oferecia somente nome/preço e não permitia revisar o formulário completo. A demonstração agora reutiliza AdminProductForm com adaptador exclusivamente em memória, explicitamente separado do cliente HTTP usado pela loja integrada. Inclui criar, editar, excluir com confirmação e cancelar a exclusão. Mudanças desaparecem ao recarregar.
- O painel conectado e a demonstração mostram botões textuais Editar/Excluir por produto. Editar reúne nome, preço, estoque, descrições, embalagem, queixas, tags, ingredientes e imagens; desmarcar Exibir este produto oculta da vitrine sem excluir.
- Dentro do formulário, Cadastrar ingrediente novo cria a opção e já a adiciona à composição. Adicionar Ingrediente utiliza opções existentes. Na demonstração os cadastros ficam somente em memória.
- Fotos continuam sendo links HTTPS, até oito. Acrescentadas prévias, remoção de links e ação Usar como capa. Não há upload de arquivo do computador ou celular implementado; isso está expresso na interface.
- Não foi alterado o contrato do backend nesta etapa. Um teste novo confirmou que mudar nome/preço/fotos/composição e depois excluir o produto preserva nome, preço e total dos itens de pedidos anteriores; a referência ao produto fica nula.
- Arquivos: App.jsx, AdminProductForm.jsx, AdminCatalogManager.jsx, DemoStudio.jsx; novos DemoProductManager.jsx e demoProductService.js; extensão de browser-smoke.mjs e AdminCommerceTest.php.
- Validação: build e teste demo passaram; 65 testes PHP passaram, 452 asserções; Chromium passou em desktop/celular, incluindo novo ingrediente, salvar/reabrir a edição, trocar capa, remover foto, confirmar/cancelar exclusão e criar blend sem chamadas à API na demonstração.
- Permanecem as pendências do ambiente integrado (PDO MySQL/migrações) e de homologação. Nenhuma conta ou dado do banco configurado foi alterado.

## Queixas como relatos do cliente e públicos-alvo

Regra confirmada: categorias organizam produtos; queixas representam o que a pessoa relata sentir e definem públicos-alvo. O cliente escolhe **somente a principal** no dropdown. Um blend pode receber vários alvos desse mesmo cadastro.

- Criada área independente `Queixas e públicos-alvo`, com criar, editar e excluir, explicando onde as opções serão usadas. Removido o cadastro de queixas da seção de blends/tags/ingredientes; categorias continuam em área separada.
- O formulário do cliente usa as opções cadastradas e começa com um placeholder sem seleção automática da primeira queixa. Continua preservando a opção Outro e respostas antigas. O backend mantém um único campo textual cifrado para a queixa principal e rejeita listas; não houve nova migração nem alteração do contrato de persistência.
- O formulário do blend apresenta uma lista recolhível de queixas para seleção múltipla. O cadastro das opções fica na área própria.
- A demonstração reutiliza o gerenciador de queixas e o questionário do cliente com o adaptador em memória. É possível criar uma queixa, abrir Testar formulário do cliente, selecionar uma principal e vê-la também entre os alvos do blend, sem usar a API real.
- Corrigidos os exemplos de queixas na demo: ansiedade, dificuldade para dormir e cansaço (todos explicitamente fictícios). Categorias da demo continuam sendo aromas florais/herbais/cítricos.
- Arquivos: novo AdminComplaintsManager.jsx; AdminDashboard/AdminCatalogManager/AdminProductForm/OnboardingModal/App; DemoProductManager/demoProductService/demoModel; AGENTS.md, AdminCommerceTest.php e browser-smoke.mjs.
- Validação: build e teste demo passaram; 66 testes PHP, 464 asserções, incluindo cadastro da queixa, listagem pública sem categorias, atribuição ao blend, salvamento de uma principal e rejeição de múltiplas no perfil. O banco configurado não foi alterado; seguem as pendências anteriores de ambiente integrado.

## Associação de produtos dentro do gerenciador de categorias

- Removida da demonstração a seção separada Adicionar produto à categoria, que apresentava categorias por produto.
- O botão agora fica dentro de cada categoria no Gerenciador de categorias, junto da lista expansível de produtos. Ele abre a seleção de blends disponíveis e exige Adicionar selecionados; Cancelar descarta a seleção.
- Associações com outras categorias são mantidas. Remover vínculo afeta somente a categoria em questão. O painel integrado já apresentava esse fluxo e permaneceu sem alterações.
- Arquivos alterados: testes/demo/DemoStudio.jsx, testes/browser/browser-smoke.mjs e este registro. Build/dist regenerado.
- Validação: build e teste demo passaram; Chromium aprovou navegação em desktop/celular, ausência da seção separada, cancelamento e adição cumulativa dentro da categoria. Demonstração sem chamadas à API. PHP não foi executado nesta etapa, pois não houve alteração de backend.

## Criação e edição de categorias na demonstração

- A demonstração passou a reutilizar AdminCategoryManager, o mesmo componente do painel conectado, com adaptador explicitamente em memória. Isso evita manter uma segunda interface incompleta para categorias.
- Para criar, preencher Nome da nova categoria e clicar Adicionar categoria. Para renomear, usar Editar na categoria, alterar o campo e clicar Salvar categoria; Cancelar descarta a edição.
- Botões Editar/Excluir agora têm texto visível no gerenciador. A demonstração também usa a lista expansível, associação de produtos e ordenação por arrastar do componente compartilhado. Contratos e controles do backend não foram alterados.
- Arquivos: AdminCategoryManager.jsx, AdminDashboard.jsx, DemoStudio.jsx; novos DemoCategoryManager.jsx e demoCategoryService.js; browser-smoke.mjs e este registro. Build/dist regenerado.
- Validação: build e teste demo passaram; Chromium em desktop/celular aprovou criar, rejeitar nome duplicado, renomear mantendo produtos, cancelar edição e cancelar/confirmar exclusão preservando os produtos e as outras associações. A demonstração continuou sem chamadas à API real. PHP não foi executado nesta etapa, por não haver mudança de backend.

## Retirada em loja e formas de pagamento — prévia visual

Decisão confirmada: oferecer retirada em loja com pagamento **Pix ou cartão de crédito pelo checkout**, sem pagamento presencial nesta proposta.

- Novo DemoCheckout.jsx apresenta Receber em casa ou Retirada em loja. Na retirada, não solicita endereço de entrega nem escolha de transportadora e remove o frete do total. Endereço e horários reais da loja não foram inventados; a tela indica que ainda precisam ser definidos.
- Pix e cartão de crédito podem ser selecionados em ambas as modalidades. O resumo mostra a escolha e o total fictício; mudar entrega, frete, pagamento ou endereço limpa o resultado simulado anterior. A tela não pede dados de cartão e não gera QR Code, pedido, cobrança ou reserva de retirada real.
- DemoStudio.jsx passa carrinho/cenário ao componente isolado; não há adaptador real nem chamadas de API neste fluxo. browser-smoke.mjs foi ampliado para verificar retirada, ambas as formas de pagamento, totais e retorno à entrega.
- Corrigida a abertura direta do checkout nos cenários vazio/sem estoque: a sacola começa vazia e não oferece simulação de pagamento.
- Validação: build e teste do modelo demo passaram. Chromium aprovou entrega/retirada, Pix/cartão, frete zero na retirada, retorno ao frete expresso, limpeza do resultado anterior, pagamento recusado, cenários sem itens e ausência de chamadas à API na demo. Capturas em desktop/celular foram inspecionadas, sem transbordamento horizontal. A suíte de navegação/administração também passou. Backend e CartDrawer integrado não foram alterados; testes PHP não foram repetidos nesta etapa.

### Dependência para a integração real

O contrato atual exige CEP, endereço e opção de frete numérica; `expected_shipping_price` tem mínimo 0.01, e o backend recota o frete. Não é compatível com retirada gratuita ainda. Pagamento usa preferência/redirecionamento Checkout Pro e o cliente não envia uma forma de pagamento selecionada na loja.

A trilha de pagamentos/frete precisa coordenar a inclusão de modalidade de recebimento, retirada configurada no servidor, frete zero validado no backend, endereço dispensado quando aplicável e disponibilidade de Pix/cartão confirmada pelo provedor. Também precisa definir estados/prontidão/comprovação da retirada e manter idempotência, estoque e confirmação confiável do pagamento. Selecionar Pix/cartão na prévia não implementa checkout transparente nem confirma pagamento na aplicação integrada.

## Aba Pedidos e preparação das encomendas

Etapas confirmadas pelo usuário: pagamento confirmado → em preparação → a caminho → entregue. Para retirada: pagamento confirmado → em preparação → pronto para retirada → retirado. A etapa é do pedido; não altera o cadastro nem o estoque do produto na prévia.

- A loja ganhou a aba Pedidos no menu, acesso por Minha conta e retorno do pagamento direcionado à consulta. O cliente vê itens, quantidades, valores, etapa, rastreio disponível e pode atualizar a consulta após falha ou mudança pela loja. Visitantes recebem acesso ao login; clientes não verificados recebem orientação de confirmação, preservando a dispensa já existente do modo de teste local informado pelo servidor. A API continua aplicando autenticação, confirmação de email e isolamento por cliente.
- Cliente e administrador compartilham OrderProgress. No ambiente integrado, são exibidos somente os estados retornados pelo backend: pendente, pago, enviado e cancelado. Não foram inventadas datas ou um histórico de eventos. Atualizar busca os dados novamente; não há notificações nem acompanhamento automático da transportadora.
- O painel tem atalho Gerenciar pedidos e destaca itens, quantidades e valores para preparação. A ação integrada de rastreio agora respeita também a permissão `orders.ship` na interface; a rota já possuía esse gate no backend.
- Na demonstração, o mesmo AdminOrderManager usa um adaptador exclusivo em memória. Permite filtrar por etapa e avançar a preparação, envio/entrega ou retirada. O envio simulado exige rastreio fictício; pedidos pendentes e com problema de estoque não avançam. Não há confirmação manual de pagamento. Trocar para a aba Pedidos mostra ao cliente as alterações da sessão; recarregar restaura os exemplos.
- Foram incluídos exemplos fictícios de entrega, retirada e pagamento pendente, com preços e totais consistentes. Não foi criada API de atualização de etapas, migração ou persistência dessas novas etapas no Laravel.
- Arquivos: App.jsx, Navbar.jsx, AdminDashboard.jsx, AdminOrderManager.jsx, CustomerOrderHistory.jsx; novos OrderProgress.jsx e orderPresentation.js; DemoStudio.jsx, demoModel.js, novo demoOrderService.js e demoOrders.test.js; package.json, browser-smoke.mjs e este registro.

### Contrato de pedidos a coordenar com pagamentos/frete

O campo legado `status` mantém o enum `pending/paid/shipped/cancelled`. A entrega de integração registrada ao final deste documento acrescentou `fulfillment_method`, `fulfillment_status`, revisão e histórico ao Laravel, sem substituir o estado financeiro. Retirada no checkout ainda depende da próxima integração.

A integração precisa definir a persistência da modalidade e do status de atendimento, permissões por operação, validação no servidor, tratamento de concorrência, auditoria e verificação do pagamento/estoque. O status operacional não pode confirmar pagamento ou sobrescrever resultados do provedor. A decisão mais recente do usuário permite selecionar diretamente qualquer status operacional compatível com entrega/retirada, inclusive voltar, sem informar motivo; o histórico é automático. Essas alterações de status continuam simuladas. Regras de devolução/estorno e eventual atualização automática da transportadora precisam de integração própria.

Validação executada: `npm --prefix frontend test`, build Vite e `php artisan test` (66 testes, 464 asserções). Testes de modelo verificam separação entre andamento e pagamento, entrega/retirada, transições inválidas, rastreio, estado desatualizado, filtros e preservação das fixtures. Não houve chamada a serviços reais, migração do banco configurado ou homologação com Mercado Pago/Melhor Envio.

Chromium aprovou o fluxo completo de gestão simulada refletido no cliente, filtros por etapa, pedido pendente sem ação de preparação, bloqueio de envio sem rastreio, estados vazios e ausência de chamadas à API na demo. A loja com respostas fictícias da API passou em 390, 768, 1024 e 1440 px, incluindo menu móvel, consulta/atualização após falha, visitante sem consulta, confirmação de email, retorno do pagamento no modo local e ocultação do envio sem permissão. As verificações anteriores de catálogo/administração continuaram passando, sem erros JavaScript; capturas do cliente e da retirada foram inspecionadas.

## Fluxo anterior: correção de etapa marcada por engano

Este fluxo foi substituído pela seleção direta de status, descrita ao final deste documento. O motivo obrigatório e os botões de correção abaixo registram a implementação anterior.

- O administrador fictício pode usar Corrigir etapa, informar um motivo de 5 a 500 caracteres e confirmar para voltar uma etapa operacional: A caminho → Em preparação, Entregue → A caminho, Pronto para retirada → Em preparação, Retirado → Pronto para retirada ou Em preparação → Pagamento confirmado. Cancelar descarta o formulário. A correção não altera pagamento nem permite voltar a pagamento pendente.
- Na simulação, voltar do envio para preparação remove o rastreio da visão do cliente e o conserva no histórico interno junto do motivo, etapa anterior/nova, responsável fictício e horário da operação. Avanços também são registrados. O histórico é somente da sessão demo; não equivale à auditoria persistida do Laravel e não aparece para o cliente.
- A revisão da etapa é incrementada em cada alteração, incluindo correções. Uma ação com dados anteriores é rejeitada mesmo que o pedido tenha voltado ao mesmo estado.
- Avançar para A caminho, Entregue, Pronto para retirada ou Retirado pede confirmação na demo. A ação integrada Salvar rastreio também pede confirmação quando vai marcar um pedido pago como enviado e explica esse efeito na tela. Rejeitar a confirmação não envia a requisição.
- Corrigir a marcação não desfaz uma entrega física, etiqueta ou chamada ao transportador. Não há endpoint integrado de correção nesta etapa; essa parte continua dependente do contrato de pedidos descrito acima, incluindo permissão própria, motivo obrigatório, concorrência, auditoria e eventos/notificações que já tenham sido enviados.
- Arquivos: AdminOrderManager.jsx, demoOrderService.js, demoOrders.test.js, browser-smoke.mjs e este registro. Build/dist regenerado. Build e testes de modelo passaram, incluindo correção de envio/retirada, motivo inválido, preservação de pagamento/histórico e rejeição de revisões antigas. Backend não foi alterado; testes PHP não foram repetidos nesta etapa.
- Chromium aprovou confirmação/cancelamento do envio, cancelamento do formulário de correção, bloqueio de motivo vazio, retorno de A caminho para Em preparação, histórico interno com rastreio anterior e atualização da visão do cliente sem o rastreio incorreto. Também verificou que rejeitar a confirmação na ação integrada de rastreio não chama a API. A suíte completa passou, sem erros JavaScript nem chamadas reais na demo; captura do formulário de correção inspecionada.

## Nome para retirada em loja

- DemoCheckout solicita Nome de quem vai retirar ao escolher retirada. O campo vem com nome fictício editável, aceita até 120 caracteres e rejeita nome vazio ou composto somente de espaços. O resumo e o resultado simulado mostram o nome informado sem espaços nas extremidades; alterar o nome limpa o resultado anterior.
- Escolher entrega oculta o campo e dispensa a validação de retirada. Voltar para retirada mantém a edição durante a sessão do checkout. Não são exigidos dados reais na demonstração.
- O exemplo de pedido de retirada inclui `pickup_contact_name`, exibido no AdminOrderManager e CustomerOrderHistory. O checkout continua sem criar pedido nem atualizar os pedidos de exemplo ao simular pagamento; esses dados permanecem fixtures separadas.
- A integração real do nome depende do contrato de retirada descrito acima: validar no servidor, persistir no pedido com proteção de dados pessoais e retornar somente aos usuários autorizados. Não foram criadas regras para autorizar terceiros a retirar nem coleta de documentos. O campo da fixture não comprova suporte na API real.
- Arquivos: DemoCheckout.jsx, demoModel.js, AdminOrderManager.jsx, CustomerOrderHistory.jsx, browser-smoke.mjs e este registro. Build e testes de modelo passaram. Backend não foi alterado; testes PHP não foram repetidos nesta etapa.
- Chromium aprovou nome fictício inicial, bloqueio de nome só com espaços, edição/reflexo no resumo, limpeza do resultado anterior, campo oculto na entrega e edição preservada ao voltar à retirada. O nome da fixture apareceu nos detalhes do cliente e do administrador. A suíte completa passou, sem erros JavaScript e sem chamadas à API na demo; captura móvel do checkout inspecionada.

## Início como catálogo e categorias na vitrine

- Corrigida a lacuna da demonstração: havia uma lista plana de produtos e duas páginas semelhantes, Início e Catálogo, enquanto as categorias apareciam somente no administrador fictício. A loja integrada já exibe seções por categoria em sua página inicial; esse fluxo não foi alterado.
- A prévia agora apresenta apenas Início como catálogo, com navegação pelas categorias e carrosséis dos produtos associados. Links antigos `view=catalogo` continuam abrindo a página inicial; a sacola também direciona Adicionar produtos para Início.
- A vitrine acompanha a ordem das categorias no gerenciador e a ordem independente dos produtos em cada categoria. Um blend com vários vínculos aparece em todas as categorias correspondentes. Categorias vazias/inativas não geram seções. Produtos ativos sem categoria disponível continuam em Outros produtos (ou Todos os produtos quando não há categorias ativas).
- A busca apresenta uma lista única de resultados, sem repetir o blend que pertence a várias categorias; Limpar busca restaura as seções. Favoritos mantém sua lista própria.
- Arquivos: DemoStudio.jsx, demoModel.js; novos DemoCatalog.jsx, demoCatalogModel.js e demoCatalog.test.js; browser-smoke.mjs e este registro. Sem mudanças no backend, contratos ou dependências. Testes PHP não foram repetidos nesta etapa.
- Validação: testes de modelo e build passaram. Os testes cobrem vínculos múltiplos, ordenação por categoria, exclusão de vínculo/categoria sem perder produtos, compatibilidade de links e estados vazios. Chromium aprovou uma única aba inicial, categorias em desktop/celular, busca sem duplicação, categoria criada/renomeada/excluída refletida na vitrine e produto recém-criado aparecendo em Outros produtos. A suíte completa passou, sem erros JavaScript nem chamadas à API na demo. Capturas da vitrine foram inspecionadas em 390 e 1440 px.

## Status direto e pedidos visíveis somente após pagamento

Decisão mais recente: o administrador escolhe o status real do pedido diretamente, sem subir/voltar etapas, formulário de correção ou motivo obrigatório.

- A prévia apresenta um dropdown com todos os status operacionais da modalidade e o botão Salvar status. Entrega: Aguardando preparo, Em preparação, A caminho, Entregue. Retirada: Aguardando preparo, Em preparação, Pronto para retirada, Retirado. Permite saltar ou voltar diretamente, inclusive depois de entregue/retirado, sem confirmação adicional. Aguardando preparo é um estado operacional de um pedido já pago, não uma confirmação manual de pagamento.
- O histórico registra automaticamente status anterior/novo, responsável fictício e horário. Não exige nem registra motivo novo. A revisão continua impedindo ações com uma versão antiga; salvar sem mudanças não duplica o histórico. Na prévia, rastreio é opcional em envio/entrega; voltar para preparação remove o código da visão do cliente e mantém o anterior no histórico. Essa opção não altera o contrato do endpoint integrado de rastreio.
- Cliente e administrador veem somente o status atual, sem uma linha de etapas que marque como concluídas situações nunca registradas. A demo de pagamento recusado não cria um pedido pendente na lista. Exemplos de tentativa pendente continuam somente nos dados internos dos testes.
- O backend integrado agora restringe lista/detalhe do cliente e consulta administrativa a registros com status autoritativo `paid` ou `shipped`, mantendo isolamento por cliente, permissões e filtros/paginação. Pedidos pendentes e cancelados do fluxo atual não aparecem nessas consultas; acesso direto pelo número também é recusado. O ajuste é de consulta, sem alterar o formato da resposta, enum ou o fluxo do gateway.
- O CheckoutService ainda precisa criar um registro pendente interno antes do pagamento para idempotência, reserva de estoque, expiração e conciliação. Esses registros não foram apagados nem proibidos: a regra de mostrar pedidos apenas após confirmação é aplicada nas consultas. Mudar a criação física para depois do pagamento exigiria coordenar outro contrato de pagamentos. A confirmação continua vindo do servidor/provedor e não do administrador.
- A seleção direta e a persistência dos novos status operacionais **continuam pendentes de integração** com pedidos/frete. O painel integrado mantém sua ação existente de rastreio, com validação/autorização/auditoria no Laravel. Nenhuma cobrança, etiqueta ou entrega externa é desfeita por mudar um rótulo.
- Arquivos: AdminOrderManager.jsx, OrderProgress.jsx, orderPresentation.js, CustomerOrderHistory.jsx, demoOrderService.js, demoOrders.test.js, browser-smoke.mjs; OrderController.php, AdminCommerceTest.php e este registro. Sem migrações, dependências ou alteração do banco configurado.
- Validação: testes do frontend e build passaram; `php artisan test` passou com 67 testes e 483 asserções. Os testes verificam consulta paginada apenas de pagos, tentativas mantidas internamente, isolamento do cliente, acesso por número, aparecimento após confirmação confiável simulada no servidor e preservação dos controles existentes. Chromium aprovou escolha direta de Entregue e retorno para Aguardando preparo/Em preparação, todas as opções compatíveis com entrega/retirada, ausência de formulário de motivo/diálogos na demo, histórico automático, status do cliente sem etapas inventadas, filtros e estados vazios. A suíte completa passou, sem erros JavaScript nem chamadas à API na demo; capturas do seletor foram inspecionadas em desktop/celular.

## Status operacional integrado ao Laravel

Esta entrega substitui a limitação anterior de status somente simulados. A demo continua isolada; o painel integrado passou a usar sua própria API autenticada.

- Migração `2026_10_14_000015_add_order_fulfillment.php`: modalidade (padrão delivery), status e revisão do pedido; tabela de eventos com ator, status anterior/novo, rastreio anterior/novo, revisão e horário. Sem modificar registros financeiros nem inventar eventos para pedidos antigos.
- Nova operação `PATCH /api/v1/admin/orders/{id}/fulfillment`, protegida por sessão/MFA e `orders.fulfillment.update`. O proprietário pode salvar; técnico e cliente não. O payload aceita status compatível com a modalidade, revisão esperada e rastreio opcional. Pagamento, preço, estoque, modalidade e ator não podem ser alterados nesse payload.
- `OrderFulfillmentService` grava pedido e evento na mesma transação, sem motivo obrigatório, e não movimenta estoque nem confirma cobrança. Rejeita pedidos não pagos, pagamento revertido e pendências de estoque; revisão antiga retorna 409. Salvar sem alteração não cria outro evento. Falha em qualquer auditoria desfaz a operação.
- A consulta administrativa retorna o status, revisão, opções permitidas e as 50 alterações mais recentes por pedido; `fulfillment_stage` filtra também os estados legados. A consulta do cliente retorna somente o próprio pedido/status, sem histórico/atores administrativos.
- O endpoint legado de rastreio usa o mesmo serviço e histórico, mantém sua semântica de compatibilidade e não rebaixa um pedido já entregue. O webhook de pagamento passa a reconhecer envio/entrega/retirada operacional ao decidir reserva/reposição de estoque, sem sobrescrever o status operacional.
- `orderFulfillmentService.js` liga o seletor real à API, enviando a revisão recebida do servidor. O painel mostra histórico real e trata conflito recarregando o pedido, sem sobrescrever a outra edição. O adaptador demo é explicitamente simulado e não importa o cliente HTTP.
- Arquivos: nova migração, OrderFulfillmentEvent.php, OrderFulfillmentService.php e OrderFulfillmentTest.php; Order.php, OrderController.php, MercadoPagoWebhookController.php, AdminPermissions.php e routes/api.php; novo orderFulfillmentService.js; AdminDashboard.jsx, AdminOrderManager.jsx, DemoStudio.jsx, demoOrderService.js e browser-smoke.mjs; INTEGRACAO_PEDIDOS.md, ADMIN_ACCESS.md, DEPLOYMENT.md e este registro.
- Validação: build e testes do frontend passaram; Laravel passou em 75 testes e 613 asserções. Foram testados gravação/leitura real no banco SQLite isolado, permissões/MFA, integridade financeira, revisão/conflito, compatibilidade, modalidade, falhas nas duas auditorias, limite de histórico por pedido e notificações aprovadas/repetidas/estornadas. Chamadas externas foram simuladas.
- Chromium aprovou a demo sem API real e o painel com API interceptada: payload/revisão, salvar/voltar, rastreio, histórico, edição sem permissão e recuperação de conflito 409; verificações anteriores passaram, sem erros JavaScript. Captura móvel do painel integrado inspecionada. Isso não certifica um navegador conectado ao servidor de homologação.

## Teste integrado local de pedidos

Teste adicional em `testes/browser/browser-integrated.mjs`, com suporte de `testes/backend/Browser/environment.php` e `server.php`. Usa o build da loja, inicia PHP em porta local livre e aplica migrações somente em um SQLite novo em diretório temporário. Não usa respostas de API interceptadas, não lê o `.env` do projeto nem conecta o banco configurado. Não adiciona dependências ao aplicativo ou rotas de teste à aplicação normal.

Com PHP/PDO SQLite, dependências existentes e Playwright/Chromium disponíveis, execute da raiz:

```bash
npm --prefix frontend run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/protocolar-browsers PLAYWRIGHT_MODULE=/tmp/protocolar-browser/node_modules/playwright/index.mjs node testes/browser/browser-integrated.mjs
```

Os caminhos temporários do Playwright são os desta máquina; ajuste conforme a instalação de testes. Não execute os arquivos PHP de suporte em um servidor público. O script Node configura e encerra seu próprio servidor; não exige iniciar o preview ou alterar `.env`. O build deve usar a API relativa padrão `/api/v1`.

- Resultado: login pela interface e MFA TOTP, bloqueio antes do MFA, seleção direta de Entregue/retorno para Em preparação, retirada marcada como Retirado, persistência após recarga e status visível ao cliente aprovados.
- Controles: requisição com cookie sem token CSRF recusada (419), sessão exclusiva de cliente sem acesso administrativo (401 após a separação), consulta de pedido alheio recusada (404), pendentes ocultos e histórico/ações administrativas ausentes da consulta do cliente.
- Banco: conferência direta confirmou revisões, três eventos com auditoria, rastreio removido ao voltar para preparo, pagamento mantido e estoque inalterado.
- Isolamento: contas verificadas fictícias, senha/chave/MFA aleatórios, sessão com cookie exclusivo e dados/cache em diretório temporário; HTTP externo bloqueado, nenhuma cobrança ou envio. O modo que dispensa confirmação de email fica desligado. Servidor e dados temporários são removidos ao finalizar, inclusive em falhas; as capturas fictícias ficam em `/tmp/protocolar-smoke/laravel-*.png`.
- Limites: pedidos pagos e modalidade de retirada foram preparados como fixtures. Este teste não passa pelo checkout, pagamento, cadastro de endereço ou provedores. Não valida MySQL, domínio final, HTTPS, email ou publicação. O nome de quem retira ainda não está persistido fora da demo.
- Verificações desta etapa: build Vite, três arquivos de testes do frontend, 75 testes Laravel/613 asserções e teste integrado Chromium aprovados; formatação PHP conferida. Não houve alteração de regras ou telas da aplicação nesta etapa.

## Separação de sessões em 15/10/2026

- Loja e painel usam guards e providers por papel, objetos de sessão independentes, cookies HttpOnly diferentes e CSRF próprio. O servidor seleciona o contexto por rota, antes da sessão; não depende de flags do navegador. Nenhuma tabela ou dependência da aplicação foi adicionada.
- Novo módulo React `/admin`, com formulário administrativo, MFA existente e Sair do painel. A loja contém Acesso administrativo e mantém sua conta separada. Chamadas administrativas usam um cliente Axios com `ADMIN-XSRF-TOKEN`. O painel não carrega Pixel; a demo permanece sem API real.
- Login, consulta de identidade e logout administrativos foram movidos para `/api/v1/admin/auth/*`; MFA para `/api/v1/admin/auth/two-factor/*`. APIs operacionais preservam os caminhos e Gates, agora exigindo `auth:admin`, sem fallback para bearer token. Login de um papel no outro contexto recebe erro genérico. Os endpoints antigos de MFA retornam 404.
- Evitada duplicação do stack de cookies/sessão/CSRF nas rotas de autenticação que já usam `web`: elas excluem `EnsureFrontendRequestsAreStateful` e incluem `AuthenticateSession`. As demais APIs continuam com Sanctum stateful. A duplicação foi identificada por falha 419 no navegador durante a implementação e corrigida antes da validação final.
- Arquivos principais: novos `SessionContext.php`, `ContextSessionManager.php`, `SelectSessionContext.php`, `ContextCsrfToken.php`, `CheckCustomerRole.php` e `AdminApp.jsx`; ajustes em providers/config/bootstrap/rotas/controllers de autenticação, App/main/API, formulário de login e consumidores administrativos. Fixtures dos testes passaram a usar o guard/sessão administrativos explicitamente. Contrato e publicação em [ADMIN_ACCESS.md](ADMIN_ACCESS.md#sessões-separadas-de-loja-e-painel).
- Validação final: **79 testes Laravel, 660 asserções**, build Vite e três arquivos de testes do frontend aprovados. Chromium passou na demo e no painel com API interceptada, em desktop/celular. A suíte integrada real passou com duas abas no mesmo contexto: login de cliente seguido de administrador com TOTP, ambas identidades preservadas, recarga, ações de pedidos e logouts independentes. Cookies HttpOnly conferidos; cookie renomeado do outro contexto recusado (401), CSRF trocado recusado (419), somente cliente sem acesso ao painel (401), bearer administrativo recusado nos testes PHP e pedido alheio oculto (404). SQLite conferiu histórico, auditoria e estoque. Sem erros JavaScript; capturas do login e painel inspecionadas.
- Publicação: backend e frontend devem ser atualizados juntos, com cache de configuração/rotas atualizado e fallback SPA em `/admin`. Administradores precisam entrar novamente. Esta entrega não aplicou migrações no banco configurado nem validou HTTPS, email, MySQL ou hospedagem; não certifica prontidão para abrir vendas.
- A migração foi executada somente nos testes; o banco configurado não foi alterado e o ambiente local continua sem PDO MySQL. Antes de usar a nova versão contra esse banco, aplicar a migração em homologação com backend/frontend compatíveis e validar no banco escolhido. Retirada no checkout, nome persistido de quem retira, checkout transparente e Melhor Envio automático continuam como próximas entregas.

## Verificação da separação — 17/10/2026

Demo e testes próprios movidos para `testes/`, incluindo testes PHP, configuração Vite/PHPUnit e launcher da prévia. O frontend principal importa somente loja e painel; a demo reaproveita componentes reais em sentido único. Autoload de desenvolvimento do Composer aponta para `../testes/backend/`. Builds da loja e demo aprovados, três arquivos de testes JavaScript aprovados, 79 testes PHP/660 asserções aprovados e inicialização das fixtures PHP movidas validada em SQLite temporário. Sintaxe dos scripts Node e ferramentas PHP conferida. Suítes Playwright não executadas nesta reorganização: Playwright/Chromium externos não estão disponíveis nos caminhos documentados.

## Integração do protótipo ao site — 17/10/2026

CheckoutPage, CardPaymentForm e adaptador de SDK incorporados ao frontend definitivo; a sacola abre a tela de checkout. Pix e cartão seguem Orders no backend, com validação de preços/frete/estoque, chave estável, consulta privada e webhook assinado. Retirada tem nome criptografado e configuração explícita de instruções. A projeção de categorias validada na demo agora é compartilhada com a loja e inclui produtos sem categoria. Componentes administrativos já integrados foram preservados; demo/fixtures/testes permanecem em `testes/`. Nenhuma credencial, cobrança, serviço de produção ou banco configurado foi usado. Requer migração 000016 e homologação conforme [CHECKOUT_TRANSPARENTE.md](CHECKOUT_TRANSPARENTE.md).

Validação: builds da loja/demo e três arquivos de testes JavaScript aprovados; 90 testes PHP/733 asserções aprovados em SQLite em memória (aviso preexistente de schema PHPUnit antigo). Chromium com build definitivo e API/SDK interceptados aprovou Pix/entrega, cartão/retirada móvel, repetição de tentativa após timeout, recusa e retomada após recarga sem repetir POST de cobrança. A suíte integrada existente contra Laravel e SQLite temporário também passou para sessões, CSRF, MFA, pedidos, auditoria e estoque. Esses ensaios não homologam chamadas reais do Mercado Pago nem desafios 3DS.
