# Cadastro de distribuidores

O login público oferece Entrar, Cliente e Distribuidor. O cadastro envia
`account_type: distributor` para `/api/v1/register`. O backend mantém
`role: customer` e grava `is_distributor`, sem conceder permissões administrativas.
O acesso é automático; a confirmação de email continua exigida para compras.

Aplique a migração `2026_11_01_000000_add_is_distributor_to_users_table.php`
no ambiente de destino antes de disponibilizar o novo cadastro. Ela adiciona
um booleano com valor padrão falso, preservando contas existentes.

A área está em `frontend/src/components/DistributorArea.jsx`. A consulta
`GET /api/v1/distributor/lots`, em `backend/routes/api.php`, exige sessão de
cliente e identificação como distribuidor e retorna uma lista vazia.

Compra por lotes ainda não implementada: definir produto, unidades por lote,
preço, estoque e cálculo de frete antes de integrar ao checkout. A interface
atual exibe indisponibilidade, sem inventar valores nem criar pedidos.
O futuro contrato deve validar acesso, preço e múltiplos do lote no servidor;
não basta preencher a lista da rota para habilitar compras.

## CNPJ

O cadastro de distribuidor exige CNPJ. `frontend/src/services/cnpj.js` e
`backend/app/Support/Cnpj.php` validam formato e dígitos verificadores pelo
módulo 11, incluindo o formato alfanumérico (ASCII menos 48). Pontuação é
removida e letras são normalizadas para maiúsculas. O valor normalizado é
armazenado em `users.cnpj`; aplique também a migração
`2026_11_01_000001_add_cnpj_to_users_table.php`. Contas anteriores permanecem
inalteradas. Não há consulta externa, comprovação de titularidade ou
confirmação de situação cadastral; dígitos válidos não comprovam existência.

Referência: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf

## Estoque, planejamento e suporte

A migração `2026_11_01_000002_create_distributor_workspace_tables.php` cria:
estoque particular (`distributor_inventory`), planejamento de compras
(`distributor_purchase_plans`), chamados (`support_tickets`) e mensagens
(`support_messages`). Aplique as três migrações antes de usar esta área.

O estoque é um controle manual por blend do catálogo e quantidade em unidades,
com limite mínimo e alerta de reposição. Não altera estoque da loja e não
é incrementado automaticamente por pedidos. Planejamento é uma anotação
com quantidade, data e observações; não é compra, reserva nem recorrência.
As unidades planejadas ainda não estão vinculadas aos futuros lotes.

Rotas `/api/v1/distributor/workspace`, `/inventory`, `/plans` e `/support`
exigem cliente autenticado com `is_distributor`. Alteração, exclusão e leitura
de conversas verificam o dono no servidor. Chamados aceitam texto simples,
até 4.000 caracteres por mensagem; não têm anexos ou notificações externas.
O usuário consulta novas respostas com o botão Atualizar.

O painel `/admin` oferece Suporte aos proprietários com permissões por operação
`support.view`, `support.reply`, `support.manage`. Técnicos continuam sem
acesso comercial. Respostas e mudanças de status passam pelo MFA, sessão,
CSRF e auditoria administrativos existentes. Chamados encerrados não aceitam
mensagens até serem reabertos pela administração.

### Prévia isolada

`npm --prefix testes run dev` serve a demonstração em `http://127.0.0.1:4174/`.
Abra `?view=distribuidores` para estoque, planejamento e suporte do distribuidor;
abra `?view=suporte` para responder como administrador fictício. Alterne pelas
abas do laboratório para preservar a conversa em memória. Recarregar reinicia
os dados. O cenário vazio começa sem registros. Nenhuma ação envia dados para
APIs reais, cria contas ou pedidos. Os componentes reais recebem adaptadores
de memória, implementados exclusivamente em `testes/demo/`.

### Seleção de blends do catálogo

Estoque e próximas compras usam dropdown com os blends ativos criados no painel,
incluindo blends sem estoque na loja. O workspace fornece `products: [{id, name}]`.
Os formulários enviam `product_id`; o backend valida existência e atividade e
obtém o nome no banco, ignorando nomes enviados pelo cliente.
A migração `2026_11_01_000003_link_distributor_records_to_products.php` adiciona
vínculos opcionais e amplia o campo de nome para 255 caracteres. Dados antigos
são preservados sem associação automática por nome. Ao editar um registro sem
vínculo, ou cujo blend foi excluído/desativado, é necessário selecionar um blend
ativo. A exclusão do produto mantém o registro e o nome salvo como histórico.
A demo reutiliza o catálogo do laboratório, inclusive mudanças feitas no admin
simulado na mesma sessão. Reabrir a aba carrega as opções atuais.
