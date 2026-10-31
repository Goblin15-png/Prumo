# Distribuidores — prévia isolada da Pruma Essential

## Entrega desta etapa

O relatório pede cadastro de empresa, acesso próprio, solicitação de produtos, histórico e acompanhamento pelo lojista. A implementação desta etapa é **somente demonstração visual em `testes/`**, para validar o fluxo antes de definir contratos e integrar ao Laravel. Não cria usuários reais, endpoints, migrações, permissões administrativas, cobranças ou reservas de estoque. Não é incluída no build público `frontend/dist` nem em `wrangler.json`.

Depois de instalar as dependências do frontend, execute:

```sh
npm --prefix testes run dev
```

Abra `http://127.0.0.1:4174/?view=distribuidores&persona=visitante`. Não exponha o laboratório como loja pública e não informe dados ou senhas reais.

## Fluxo demonstrado

1. **Cadastro simulado:** nome e CNPJ de exemplo, com cálculo de dígitos verificadores e unicidade em memória. O campo de senha é apenas ilustrativo e somente leitura; nenhuma senha é coletada ou usada como login.
2. **Distribuidor pendente:** acompanha a situação do cadastro, sem enviar solicitações nesta proposta.
3. **Lojista fictício:** visualiza empresas e aprova ou rejeita as pendentes.
4. **Distribuidor aprovado:** consulta blends disponíveis no cenário, informa quantidades inteiras positivas e envia uma solicitação sem pagamento. Não há preço de atacado definido, promessa de fornecimento ou limite comercial presumido.
5. **Histórico e tratamento:** cada empresa selecionada vê suas solicitações; o lojista pode marcar Recebida/Em análise/Respondida e registrar um retorno fictício. O retorno não é enviado por email nem mensagem externa.

Use os atalhos **Simular cadastro**, **Simular distribuidor** e **Simular lojista**, ou o seletor Perfil simulado. O seletor de empresas é um controle de laboratório: não é autenticação, isolamento real entre contas ou autorização de produção. As empresas iniciais usam nomes e identificadores de demonstração. Os dados novos permanecem ao navegar entre as páginas do laboratório e desaparecem ao recarregar.

Aprovação manual e situações de cadastro/solicitação são **propostas para revisão**, não regras comerciais já aprovadas. Não converter esse estado em pedidos ou acesso real por simples troca de adaptador.

## CNPJ

O modelo aceita os formatos numérico e alfanumérico (12 caracteres-base e 2 dígitos). Normaliza pontuação e letras minúsculas sem descartar letras; o cálculo usa ASCII menos 48 e módulo 11, conforme o [manual técnico da Receita/Serpro](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf). O exemplo alfanumérico do manual é usado no teste. Validar dígitos **não comprova existência, titularidade, atividade ou aprovação da empresa** e não realiza consulta externa.

A versão integrada deverá repetir a validação no servidor e garantir unicidade por índice normalizado no banco. Não basta confiar na validação JavaScript.

## Decisões necessárias antes da integração

- Aprovação manual obrigatória ou outro critério; responsável pela análise e eventual revisão/reenvio de cadastro.
- Se o fluxo é solicitação/orçamento ou pedido com pagamento; preços de atacado e quantidades mínimas.
- Entrega, frete, retirada e eventual reserva de estoque.
- Necessidade de email, telefone e responsável; identificador de login, confirmação de contato e recuperação de senha.
- Situações e transições de solicitações, prazos, cancelamento e forma de resposta ao distribuidor.
- Contas da mesma empresa e isolamento em relação ao cliente varejista.

Após aprovar UX e contrato, implementar usuários/papéis, hash de senha, autenticação, rate limiting, policies por operação, auditoria e vínculos de empresa no Laravel. Definir permissões comerciais explícitas sem concedê-las automaticamente ao técnico. Homologar migrações e concorrência no MySQL e executar os testes PHP antes de liberar acesso real.

## Verificação

`npm --prefix testes test` inclui testes do modelo/CNPJ, estados, quantidades, duplicação e histórico. Após compilar demo e loja, execute:

```sh
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node testes/browser/browser-distributors-demo.mjs
```

O teste usa os builds locais com rede externa bloqueada e verifica o fluxo em desktop/celular, ausência de chamadas de API, descarte após recarga e exclusão do módulo do build de produção. Isso não valida autenticação real, Laravel, SMTP ou MySQL.
