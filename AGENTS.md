# AGENTS.md — Protocolo Cuidar | E-commerce

> Instruções de projeto para Codex e outros agentes de programação. Leia antes de qualquer alteração.
> Fonte consolidada: decisões dos chats do projeto e estrutura do ZIP analisado. Quando houver divergência entre documentação e código, investigar e comunicar antes de modificar.

## 1. Missão e princípios

Construir e evoluir um e-commerce de **blends**, com experiência de compra clara, administração segura e integrações confiáveis. **Não reescrever tudo**: preservar o que funciona, corrigir problemas comprovados, manter compatibilidade e fazer mudanças pequenas, verificáveis e reversíveis.

- Trabalhar **visual-first**: desenhar, testar e validar telas com dados fictícios antes de conectar serviços reais.
- Nunca exigir cadastro real, endereço verdadeiro, pagamento ou credenciais de produção apenas para visualizar e testar interfaces.
- Separar ambiente **demo/mock** de desenvolvimento integrado e produção; sinalizar visualmente quando dados são simulados.
- Não alegar que algo foi implementado ou testado sem evidência no código e execução dos testes.
- Não inventar decisões de negócio, integrações, permissões ou estrutura de hospedagem.
- Responder preferencialmente em português do Brasil, explicando arquivos alterados, impactos, testes e pendências.

## 2. Stack e estado conhecido

- **Frontend:** React 18, Vite 6, Tailwind CSS 4, Axios.
- **Backend:** PHP 8.2+, Laravel 12, Laravel Sanctum, MFA TOTP (`pragmarx/google2fa`).
- **Hospedagem confirmada em 01/11/2026:** Laravel no Render serve a interface React compilada, o painel e a API no mesmo domínio; PostgreSQL é acessado somente pelo Laravel. Cloudflare foi retirado do fluxo a pedido do responsável. Dockerfile da raiz exige contexto do repositório completo. Consulte `LARAVEL_HOSTING.md`; documentação Vercel antiga é histórica. Prévia/testes continuam com SQLite isolado e não comprovam homologação de produção.
- **Node.js:** utilizado no ecossistema/frontend; **não presumir um servidor Node independente** sem confirmar sua existência e responsabilidade no repositório. Se serviços Node forem necessários, discutir contratos antes de criá-los.
- **Integrações planejadas/atuais:** Mercado Pago para pagamentos e Melhor Envio para frete.
- **Estrutura observada no ZIP:** `frontend/`, `backend/`, `SECURITY.md`, `DEPLOYMENT.md` e `AGENTS.md`.
- **Atenção:** o checkout encontrado em análise anterior usa preferência/redirecionamento externo (Checkout Pro). O **objetivo futuro** escolhido é checkout transparente dentro da loja; **não tratar essa migração como concluída**.
- Há recursos de autenticação, rotas administrativas, MFA e auditoria no código; não assumir que estejam integralmente seguros ou testados.

## 3. Domínio e regras imutáveis

### Produtos (blends)
- **Blend é o produto** comercializado.
- Administrador pode criar/editar blends e gerenciar seus **ingredientes**.
- Cada blend pode ter **uma ou várias queixas/alvos** atribuídas.
- A criação/edição do blend **não deve conter seletor de categoria**; associação é realizada na área de categorias.

### Queixas / alvos
- Queixas descrevem **o que o cliente relata sentir** (ex.: ansiedade) e definem públicos-alvo. São cadastradas em área própria e podem ser atribuídas como alvos aos blends; não são categorias.
- O formulário do cliente apresenta essas opções em **dropdown de seleção única**, para escolher apenas a queixa principal. Um blend pode ter vários alvos.
- Há área independente para cadastrar e organizar queixas/alvos.
- Administrador pode criar queixas/alvos e atribuir múltiplas a um blend.
- Não unir nem confundir queixas/alvos com categorias.

### Categorias
- Categorias **servem exclusivamente para organizar produtos**.
- Um produto pode pertencer a **várias categorias** simultaneamente; adicionar em uma categoria não remove as outras. A ordenação do produto é independente em cada categoria.
- Área própria para criar categorias, renomear e ordenar via **arrastar e soltar**.
- Permitir reordenar produtos **dentro de cada categoria** por arrastar e soltar.
- Atribuição de produto ocorre por botão/ação explícita **“adicionar produto a categoria”**.
- Manter visualização prévia textual da hierarquia, com categorias expansíveis e seus produtos.
- Não inserir seleção de categoria no formulário de criação do blend.

## 4. Divisão de responsabilidades entre conversas

Os chats são usados para evitar misturar assuntos. Antes de mudanças transversais, definir interface/contrato e coordenar a decisão no chat responsável.

| Área | Responsabilidade |
| --- | --- |
| **Site / frontend** | React, UX, páginas, catálogo, carrinho, painel visual, dados fictícios, testes de interface e backend estritamente necessário às telas. |
| **Pagamentos, frete e checkout** | Mercado Pago, checkout transparente, Melhor Envio, cálculo de frete, pedidos, webhooks, idempotência e conciliação. |
| **Segurança / administração** | Login, MFA, sessão, RBAC, proteção de APIs, auditoria, segurança do painel e revisão de vulnerabilidades. |
| **Infraestrutura / hospedagem** | Frontend Vercel + Laravel em hospedagem PHP + PostgreSQL gerenciado definidos. Escolha dos provedores restantes, domínios, redes, deploy, ambientes e operação ficam na trilha de infraestrutura. |

**Regra:** um chat pode identificar dependência de outra área, mas não deve redesenhar unilateralmente os contratos ou implementar grandes alterações fora do seu escopo.

## 5. Fluxo de desenvolvimento visual-first

1. Inspecionar o componente e seus fluxos existentes.
2. Criar/ajustar a interface com fixtures determinísticas (produtos, usuários, carrinho, pedidos, endereços fictícios).
3. Permitir navegar pelos fluxos de demonstração sem conta real e sem serviços externos.
4. Separar claramente adaptadores `mock` e `real`; nunca permitir que modo demo crie pedido, cobrança ou envio real.
5. Validar estados: carregando, vazio, erro, sucesso, permissões e responsividade.
6. Integrar com API real **somente depois** de validar contrato e UX.
7. Rodar build e testes disponíveis; relatar exatamente o que foi executado.

Se existir um laboratório/demo isolado, preservá-lo; não conectar acidentalmente suas ações a produção.

## 6. Arquitetura alvo — sem impor refatoração prematura

- Loja pública e painel administrativo podem ser **aplicações React separadas** (ou módulos claramente isolados enquanto a migração não ocorrer).
- Um **monorepo** com apps e pacotes separados é aceitável; separar builds e deploys quando definido no chat de infraestrutura.
- Preferir **Laravel como autoridade central de autenticação, autorização e regras de negócio** quando compatível com o código atual.
- Se houver serviços Node independentes, definir responsabilidades e autenticação serviço-a-serviço; evitar duplicar identidade e regras de autorização.
- Banco de dados nunca acessado diretamente pelo navegador; usar privilégios mínimos e redes privadas na implantação.
- Não assumir que domínio `admin.*`, Zero Trust, containers ou múltiplos servidores já estão configurados. São decisões/proteções a avaliar na etapa apropriada.
- Não trocar frameworks ou reorganizar pastas em massa sem necessidade demonstrada.

## 7. Segurança obrigatória — cliente e administrador

### Identidade e acesso
- Clientes e administradores têm fluxos, sessões e autorizações logicamente separados.
- Painel acessível somente a **você (responsável técnico)** e **donos da loja**, cada pessoa com conta individual; nunca compartilhar credenciais.
- Papéis iniciais pretendidos: **Administrador Técnico** e **Administrador Proprietário**. Implementar permissões **por operação**, não apenas `role === 'admin'`.
- Técnico: configurações e manutenção técnica necessárias, sem acesso financeiro por padrão.
- Proprietários: operação comercial, pedidos e ações financeiras autorizadas, sem acesso técnico irrestrito por padrão.
- Criação de novos administradores e alterações de privilégios são ações críticas com controle reforçado.
- MFA obrigatório para administradores; preferir WebAuthn/passkeys quando viável, com recuperação segura.
- Sessões com cookies `HttpOnly`, `Secure`, `SameSite` adequado, expiração, revogação, rotação quando necessária e reautenticação em ações críticas.
- Não armazenar tokens administrativos no `localStorage`.
- Verificar autorização **em cada rota/ação do backend**, inclusive exportações, uploads e endpoints usados por botões ocultos no React.

### Segurança de aplicação e infraestrutura
- Defender contra XSS, CSRF, SQL Injection, exposição de rotas/segredos, bancos abertos, força bruta, abuso de APIs, prompt injection e dependências maliciosas.
- Validar dados no servidor, usar queries parametrizadas/ORM corretamente, escapar saída e sanitizar HTML quando realmente necessário.
- Aplicar rate limiting apropriado, limites de tamanho, CORS restrito e política de conteúdo (CSP) adequada.
- Nunca confiar em dados enviados pelo navegador para preço final, estoque, pagamento, frete, privilégios ou status de pedido.
- Não incluir `.env`, segredos, tokens, dados reais de clientes ou bancos reais em commits, ZIPs, logs ou respostas.
- `.env` é apenas parte da gestão de segredos: manter fora do controle de versão, limitar acesso, rotacionar credenciais e não usar variáveis `VITE_*` para segredos.
- Avaliar origem, reputação, manutenção e vulnerabilidades de pacotes antes de adicionar dependências.
- Auditar operações administrativas críticas, sem registrar senhas/tokens. Revisar transações e efeitos externos: transação de banco **não desfaz chamadas a gateways**.
- Backups, criptografia, monitoramento e isolamento de rede devem ser definidos na trilha de infraestrutura.

### Pagamentos e frete
- Mercado Pago: objetivo é **checkout transparente dentro da loja**; migrar de Checkout Pro somente com plano e testes.
- Dados sensíveis de pagamento devem seguir fluxo seguro do provedor; não capturar nem armazenar dados de cartão indevidamente.
- Validar assinatura/autenticidade dos webhooks, conferir dados com o provedor quando necessário e garantir **idempotência**.
- Status `pago` deve derivar de confirmação confiável do backend/provedor, nunca de uma flag do frontend.
- Recalcular preço, descontos, frete, estoque e total no backend antes de criar/capturar cobranças.
- Melhor Envio: calcular cotações com dados válidos, proteger tokens e separar simulação de contratação real de frete.
- Tratar falhas, timeouts, repetição de eventos e reconciliação de pedidos, cobranças e etiquetas.
- Não alterar contratos de checkout/pedido sem coordenar o chat de pagamentos/frete.

## 8. Regras para editar o repositório

1. Antes de editar, ler este arquivo, README/documentos relevantes e os arquivos reais envolvidos.
2. Resumir a intenção, dependências e possíveis efeitos colaterais.
3. Priorizar patch mínimo e compatível, sem apagar funcionalidades existentes.
4. Incluir ou atualizar testes para regras alteradas; verificar também fluxo manual quando aplicável.
5. Rodar, quando disponíveis, `npm run build` no frontend e `php artisan test` no backend; usar testes específicos quando mais apropriados.
6. Não executar comandos destrutivos, limpar banco, aplicar migrações irreversíveis, acessar produção ou instalar serviços sem autorização.
7. Não adicionar dados de produção a fixtures, screenshots ou testes.
8. Ao terminar, informar: arquivos alterados, comportamento, testes executados, testes não executados, riscos e próximas etapas.
9. Em caso de ambiguidade de regra de negócio ou decisão de infraestrutura, perguntar antes de assumir.
10. Não chamar uma correção de “segura” ou “pronta para produção” sem revisão e evidência adequadas.

## 9. Prioridades e pendências conhecidas

1. Revisar estado atual do código, testes e autenticação existente, preservando o que já funciona.
2. Concluir segregação entre Administrador Técnico e Administrador Proprietário com policies/gates por operação.
3. Testar login, MFA, expiração, logout, CSRF, proteção de rotas e recuperação de acesso.
4. Verificar consistência e falhas de auditoria, incluindo operações que chamam sistemas externos.
5. Consolidar UX/demo de produtos, ingredientes, queixas, categorias e ordenação drag-and-drop.
6. Auditar fluxo atual de checkout e planejar migração para transparente, sem quebrar pagamentos existentes.
7. Validar integração Melhor Envio, frete, webhooks, idempotência e ciclo de pedidos.
8. Tratar hospedagem, deploy, Zero Trust, subdomínios e isolamento em **outro chat**.

## 10. Critérios de conclusão de uma tarefa

Uma tarefa só está concluída quando: (a) atende ao requisito; (b) não mistura categorias e queixas/alvos; (c) mantém separação demo/real; (d) aplica controles no backend; (e) tem testes pertinentes executados ou limitações explicitadas; e (f) não introduz segredos nem regressões conhecidas.

**Importante:** este documento é uma consolidação de decisões e objetivos; não comprova que todos os recursos já estejam implementados.
