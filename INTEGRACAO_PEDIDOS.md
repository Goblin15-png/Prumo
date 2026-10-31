# Pedidos, retirada e checkout

Atualização em 17/10/2026: checkout definitivo com entrega/retirada, nome criptografado e pagamento dentro da loja via Orders implementado no código. Contrato, configuração e limites em [CHECKOUT_TRANSPARENTE.md](CHECKOUT_TRANSPARENTE.md). Homologação com credenciais do provedor permanece pendente.

Atualização em 18/10/2026: o painel consulta novos pedidos a cada 15 segundos enquanto a aba está visível e ao voltar para ela, mantendo filtros e paginação. A atualização automática pausa durante alterações ainda não salvas ou gravação de um pedido; respostas antigas não substituem consultas mais recentes. A lista operacional continua mostrando somente pedidos pagos.

Validação em 19/10/2026: `testes/browser/browser-orders-refresh.mjs` passou com Chromium, Laravel e SQLite descartável. Uma compra pela interface apareceu no painel já aberto; filtros, pausa durante edição, resposta atrasada e descarte de rascunho fora do filtro foram verificados. Pagamento simulado e serviços externos bloqueados; esse ensaio não homologa os provedores.

Registro anterior: atualização local em 14/10/2026. Registra a integração dos status operacionais implementada no código e as próximas entregas de pedidos/checkout, conforme AGENTS.md. A nova migração foi executada somente no banco isolado dos testes; não comprova homologação ou prontidão para vendas.

Atualização de autenticação em 15/10/2026: o painel integrado passa a ser acessado em `/admin`, com login/MFA e sessão independentes da loja. As APIs operacionais de pedidos continuam nos mesmos caminhos, agora exigindo a sessão administrativa própria. Contrato e publicação em [ADMIN_ACCESS.md](ADMIN_ACCESS.md#sessões-separadas-de-loja-e-painel).

## Decisões já confirmadas

- Início é o catálogo; categorias organizam produtos e permitem vínculos múltiplos. Queixas são independentes.
- As áreas de pedidos do cliente e do administrador mostram somente compras com pagamento confirmado.
- Registros pendentes usados internamente para acompanhar cobranças, estoque, expiração e idempotência continuam existindo. Não são pedidos a preparar nem devem aparecer na lista operacional.
- Entrega e retirada são modalidades distintas. Retirada dispensa endereço de entrega, tem frete zero e pede o nome de quem vai retirar.
- Pix e cartão são pagos pelo checkout, inclusive na retirada. Não foi escolhido pagamento presencial.
- O administrador escolhe diretamente qualquer status operacional compatível com a modalidade e salva, inclusive ao voltar. Não informa motivo e não percorre etapas obrigatórias. O histórico é automático.
- Entrega: Aguardando preparo, Em preparação, A caminho, Entregue. Retirada: Aguardando preparo, Em preparação, Pronto para retirada, Retirado.
- Pagamento é confirmado pelo servidor/provedor. Não há opção administrativa de marcar Pago.

## Estado verificado no código

| Parte | Estado atual | Próximo trabalho |
| --- | --- | --- |
| Catálogo/administração | CRUD, associações, permissões e métricas têm código integrado e testes locais | Exercitar telas contra Laravel e banco de homologação |
| Consulta de pedidos pagos | Filtro aplicado no OrderController, inclusive no acesso por número | Validar no fluxo integrado após a confirmação do provedor |
| Status operacional direto | API Laravel e adaptador real implementados; fluxo Chromium → Laravel → SQLite validado com fixtures; demo permanece isolada | Aplicar a migração 000015 em homologação e validar no banco escolhido |
| Retirada e nome de quem retira | Integrados ao checkout real, com validação e persistência criptografada | Configurar local/orientações e homologar |
| Pagamento | Tela definitiva usa Checkout Transparente via Orders; legado Checkout Pro preservado | Configurar credenciais/notificações e homologar Pix/cartão/3DS |
| Melhor Envio | Serviço de cotação implementado | Definir operação de etiquetas/postagem/coleta e sincronização, se incluída |
| Ambiente | Teste integrado local reproduzível com SQLite temporário; PHP expõe somente o driver PDO SQLite | Preparar homologação e o driver do banco escolhido |

Além dos testes com API interceptada, foi executado um teste do navegador contra Laravel e um banco SQLite temporário. Isso não homologa provedores nem o ambiente final. O driver MySQL não está disponível neste ambiente; esta revisão não consultou nem alterou o banco configurado.

## Primeira entrega implementada: status persistido

O painel integrado agora usa a API de status do Laravel. O cliente lê o status persistido na consulta dos próprios pedidos. A demo continua usando seu adaptador em memória; não foi conectada à API real.

Contrato implementado nesta entrega:

| Campo | Semântica |
| --- | --- |
| `fulfillment_method` | `delivery` ou `pickup`, escolhido no checkout e validado pelo servidor; retirada dispensa endereço e tem frete zero |
| `fulfillment_status` | Valores internos usados na demo: `confirmed` (Aguardando preparo), `preparing`, `shipped`, `delivered`, `ready_for_pickup`, `collected` |
| `fulfillment_revision` | Versão incrementada a cada alteração; impede sobrescrever uma edição concorrente |
| `pickup_contact_name` | Nome obrigatório na retirada, persistido com criptografia no backend |
| Histórico operacional | Pedido, status anterior/novo, administrador e horário registrados pelo servidor, sem exigir motivo digitado |

- Manter o estado financeiro atual separado. O nome interno `confirmed` do protótipo não autoriza confirmar uma cobrança.
- Autorizar a gravação por operação no backend, concedendo-a somente ao perfil comercial adequado; esconder um botão no React não é controle de acesso.
- Aceitar apenas os status da modalidade e apenas pedidos pagos aptos à preparação. Não confiar em pagamento, valor, estoque, modalidade ou identidade de administrador enviados pelo navegador.
- Gravar alteração e histórico na mesma transação. Usar bloqueio/versão para rejeitar dados desatualizados. Salvar sem mudança não deve duplicar eventos.
- Retornar o status efetivo ao cliente sem inferir que etapas intermediárias foram concluídas. O histórico administrativo não deve expor informações internas na consulta pública do cliente.
- Coordenar compatibilidade com o endpoint atual de rastreio e com o webhook de pagamento, evitando que atualizações concorrentes sobrescrevam o estado operacional ou movimentem estoque novamente.
- Rastreio é opcional na nova ação de status e permitido para entrega nos estados A caminho/Entregue; ao voltar para preparo, é removido da visão do cliente e o anterior permanece no histórico. O endpoint legado de rastreio continua exigindo código e passa pelo mesmo serviço/histórico. Ele não rebaixa um pedido já entregue.

### API e autorização

`PATCH /api/v1/admin/orders/{id}/fulfillment` exige sessão administrativa, MFA vigente e Gate `orders.fulfillment.update`, concedido ao proprietário e negado ao técnico/cliente.

Payload: `fulfillment_status`, `expected_revision` obrigatório e `tracking_code` opcional. O servidor define ator, modalidade e valores persistidos. Não aceita alterações de pagamento, preço, estoque, modalidade ou identidade do ator nesse payload. Pedidos com pagamento pendente/revertido ou problema de estoque são recusados.

Compatibilidade financeira: registros antigos já marcados pelo servidor como `paid/shipped`, mas sem `payment_status`, continuam operáveis. Havendo `payment_status` registrado, exige `approved`; estorno/contestação bloqueiam a edição operacional. Não existe confirmação de pagamento por esse endpoint.

Retorna `data` com o pedido e status gravado. Versão antiga retorna 409; o painel recarrega os dados e pede nova seleção. Entrada inválida retorna 422. Falha na gravação do histórico retorna erro e desfaz a alteração; falha na auditoria administrativa também desfaz a transação.

`GET /api/v1/admin/orders` aceita `fulfillment_stage` e mantém filtros/paginação existentes. Retorna `fulfillment_allowed_statuses` e as 50 alterações mais recentes por pedido. O histórico completo permanece no banco; a consulta do cliente não recebe atores nem eventos internos.

Migração: `backend/database/migrations/2026_10_14_000015_add_order_fulfillment.php`. Acrescenta modalidade, status, revisão e a tabela `order_fulfillment_events`. Pedidos legados sem status operacional continuam sendo apresentados como Aguardando preparo ou A caminho conforme seu estado anterior, sem inventar eventos históricos.

O novo serviço de status não altera pagamento, preço ou estoque. O webhook do Mercado Pago reconhece envio/entrega/retirada operacional para evitar nova reserva ou reposição automática de produto já despachado. Status operacionais não são sobrescritos por notificações repetidas de pagamento. O endpoint legado de envio mantém seus campos de compatibilidade, com o histórico unificado.

## Entregas seguintes

1. **Retirada real:** configurar endereço, horários e orientações reais da loja e homologar o fluxo já implementado. Preservar reserva de estoque e idempotência.
2. **Pagamento de teste:** homologar o checkout transparente implementado com credenciais de teste. Verificar aprovação, recusa, demora na confirmação, repetição de notificações, expiração e estoque. Nenhuma marcação administrativa pode substituir a confirmação do provedor.
3. **Operação de envio:** definir se etiquetas serão emitidas no painel do Melhor Envio ou pela integração. Automatizar status exige vincular o envio ao pedido e implementar o recebimento/conferência das atualizações. Definir como conciliar uma alteração manual com uma atualização posterior da transportadora.
4. **Ensaio completo:** realizar compra fictícia, pagamento de teste, aparecimento nas listas, preparação, entrega ou retirada; conferir que o administrador altera o status e o cliente vê a atualização após consultar novamente.
5. **Publicação:** coordenar hospedagem/domínio em sua trilha, configurar email, HTTPS, banco e recuperação de backups, revisar conteúdo e executar o ensaio no ambiente final antes de abrir vendas.

## Informações necessárias antes da homologação

- Nome, endereço e horários da loja para retirada; não usar dados inventados no ambiente real.
- Catálogo com preços, estoque, imagens e peso/dimensões reais da embalagem para cotação.
- Contas/credenciais de teste dos provedores configuradas no ambiente apropriado, sem colá-las no chat ou no frontend.
- Banco e ambiente de homologação escolhidos, separados dos dados reais; estrutura de hospedagem continua pendente de decisão na trilha própria.

## Evidência disponível

Build Vite e testes do frontend aprovados. Laravel passou em 75 testes e 613 asserções, usando SQLite em memória, incluindo a nova migração, gravação/leitura do status, compatibilidade, permissões/MFA, conflito de revisão, transação/histórico, filtros e notificações de pagamento. HTTP externo foi simulado nos testes.

Chromium aprovou a demo sem chamadas de API e o painel integrado com API interceptada: payload/versionamento, gravação, retorno de status, rastreio opcional, histórico, usuário sem permissão e recuperação de conflito. Isso não substitui um ensaio do navegador contra o servidor de homologação.

O teste adicional `testes/browser/browser-integrated.mjs` usa o build real, servidor PHP/Laravel e SQLite novo em diretório temporário, sem interceptar respostas da API. Passou por login na interface, MFA TOTP obrigatório, alteração direta para Entregue e retorno para Em preparação, retirada marcada como Retirado, recarga da página e leitura pelo cliente. Conferiu CSRF (419 sem token), proibição de acesso administrativo por cliente e pedido de outra conta (404), ocultação de pendentes e ausência de histórico administrativo na resposta do cliente. A leitura direta do SQLite confirmou revisões, eventos, auditoria e estoque preservado. Capturas desktop/celular foram geradas, sem erros JavaScript.

O ambiente de teste não lê o `.env` do projeto, não desativa MFA/CSRF/verificação de email, usa credenciais fictícias aleatórias e bloqueia HTTP externo. Servidor, banco, sessões e credenciais são descartados no término. Os pedidos pagos e a modalidade de retirada são fixtures; não foram criados por checkout ou pagamento. Instruções de execução em [LANCAMENTO.md](LANCAMENTO.md#teste-integrado-local-de-pedidos).

Não foi aplicada migração ao banco configurado, nem feitas cobranças, contratação de frete, acesso a produção ou publicação. A instalação em homologação precisa executar a migração 000015 junto da publicação compatível do backend/frontend. Na data daquele ensaio, retirada no checkout, contato de retirada e checkout transparente ainda estavam pendentes. A implementação de 17/10 está descrita acima; etiquetas e sincronização do Melhor Envio continuam pendentes.
