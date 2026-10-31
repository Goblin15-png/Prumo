# Checkout dentro da loja — Orders

Implementação local em 17/10/2026. Este documento descreve o código e os limites de validação; não certifica homologação com o Mercado Pago nem prontidão para vendas.

## Fluxo implementado

A sacola abre `CheckoutPage.jsx`, no frontend definitivo. A página oferece entrega, cotação pelo Melhor Envio, retirada configurável, resumo, Pix e cartão de crédito. A retirada dispensa endereço e frete, exige o nome de quem retira e persiste esse nome criptografado para cliente/administração. Não há dados fictícios pré-preenchidos no site.

O CEP preenche rua, bairro, cidade e UF por consulta ao backend, mantendo edição manual e os dados pessoais/de complemento informados pelo cliente. A integração e a configuração dos Correios estão em [CORREIOS_CEP.md](CORREIOS_CEP.md).

Pix retorna QR Code/copia e cola na própria tela. Cartão usa o Card Payment Brick oficial, carregado de `https://sdk.mercadopago.com/js/v2`; o número do cartão e CVV não são campos do nosso React e não são enviados à API Laravel. O token retornado pelo SDK é enviado ao backend e ao provedor, sem persistência em banco, logs ou armazenamento do navegador. A tela destrói o Brick ao sair ou mudar de configuração.

O Laravel recalcula preços, estoque e frete antes de criar uma order `online`, `processing_mode=automatic`, em `/v1/orders`. A chave `X-Idempotency-Key` permanece a mesma em repetições da tentativa. Uma impressão SHA-256 vincula a chave ao payload validado. Os valores monetários enviados ao provedor são strings decimais calculadas no servidor. O estado pago deriva de resposta/consulta autenticada ao provedor, nunca de flags da interface.

Endpoints novos:

- `POST /api/v1/checkout/transparent`: sessão de cliente, email verificado, CSRF e limite de tentativas; aceita itens, modalidade, endereço ou contato de retirada e pagamento tokenizado/documento.
- `GET /api/v1/checkout/attempt/{chave}`: retoma a tentativa somente para seu cliente autenticado.
- `GET /api/v1/checkout/transparent/{numero}`: consulta privada do pedido e sincronização com o provedor.
- O webhook existente reconhece `type=order`, valida a assinatura com o ID alfanumérico normalizado e consulta `/v1/orders/{id}` antes de atualizar o pedido. Valida referência local, identificação da order, tipo, país/moeda quando presentes e total. Atualizações usam lock de banco e versão do provedor quando disponível; não repetem movimentos de estoque nem alteram o andamento operacional.

`POST /checkout` e notificações `type=payment` permanecem compatíveis com Checkout Pro legado. A nova tela não usa redirecionamento. Não reutilize uma chave entre os dois fluxos.

## Configuração e migração

Publicar frontend/backend compatíveis e aplicar `2026_10_17_000016_add_transparent_checkout.php` em homologação (junto das migrações anteriores). A migração adiciona identificação/versionamento de Orders, impressão da tentativa e contato de retirada; não foi aplicada ao banco configurado do projeto.

Variáveis no backend, sem preencher segredos no código:

```dotenv
MERCADO_PAGO_ENVIRONMENT=sandbox
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
STORE_PICKUP_ENABLED=false
STORE_PICKUP_INSTRUCTIONS=
```

Use credenciais de teste da aplicação correspondente. `environment=sandbox` identifica o ambiente na interface, mas **não transforma credenciais de produção em credenciais de teste**: Orders usa o mesmo endpoint, e o ambiente efetivo depende das credenciais/contas do provedor. O frontend recebe apenas Public Key e configurações públicas por `/runtime-config`. Não use `VITE_*` para Access Token.

No painel do Mercado Pago, configurar notificações do tópico **Order (Mercado Pago)** para o webhook HTTPS da aplicação; manter as notificações de pagamentos legados durante a transição. Configurar secret correspondente. Não configurei contas, credenciais, webhooks externos ou produção nesta tarefa.

Retirada só aparece habilitada quando `STORE_PICKUP_ENABLED=true` e há orientações em `STORE_PICKUP_INSTRUCTIONS`. Informar ali local e procedimento reais antes de disponibilizar a opção. Nenhum endereço/horário foi inventado.

## Falhas e conciliação

Respostas indeterminadas (timeout, 409, 429, 5xx ou resposta inconsistente) preservam pedido, chave e estoque. O comprador pode repetir a mesma tentativa enquanto a tela guarda seu payload em memória. Somente o UUID da tentativa fica em `sessionStorage`, para recuperar o resultado após recarga; não guarda token, documento nem endereço.

Após recarga, se a tentativa não tem ID do provedor confirmado, a consulta mantém pendente até a conciliação/notificação. Uma tentativa indeterminada sem ID e sem token em memória pode exigir investigação operacional pelo número local/chave de idempotência; não liberar estoque ou iniciar cobrança substituta sem confirmar o estado no provedor. O comando existente `orders:expire-pending` consulta Orders conhecidas e não cancela automaticamente uma cobrança porque o prazo local venceu. Falha/cancelamento/expiração confirmados pelo provedor liberam a reserva uma vez. Reembolso parcial bloqueia preparo até revisão; reembolso integral não repõe automaticamente produtos já despachados/coletados.

## Validação e limites

Testes próprios ficam exclusivamente em `testes/`, incluindo `TransparentCheckoutTest.php` e `browser/browser-checkout.mjs`. O teste de checkout no Chromium usa o build definitivo e intercepta API/SDK apenas no teste, sem chamadas financeiras. Verifica entrega/Pix, retirada/cartão, timeout com payload/chave iguais, recusa, recarga sem nova cobrança, ausência de token no storage e responsividade móvel. Isso não valida o comportamento real do SDK ou a aprovação do provedor.

Antes de vendas, homologar credenciais, QR Code Pix real de teste, cartões de teste aprovados/recusados, parcelamento, exigências de documento, notificações reais e fluxos adicionais exigidos pelo emissor (incluindo desafio 3DS). A interface atual mantém estados não finais em confirmação; não implementa uma experiência própria de desafio 3DS. Boleto, etiquetas, coleta e contratação de frete não foram incluídos. O modo local já existente continua separado e explicitamente sinalizado; não funciona em produção.

## Documentação oficial consultada

- [Modelo Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-model)
- [Cartões e Card Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards)
- [Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix)
- [Notificações de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications)

## Retomada e recotação — revisão de 31/10/2026

A loja oferece **Retomar consulta do pagamento** para o cliente autenticado quando há uma tentativa válida salva nesta aba. O atalho abre a consulta mesmo com a sacola vazia após recarregar a página. Ele só consulta o UUID existente em `/checkout/attempt/{chave}`; não cria um novo pedido nem repete o POST de pagamento. O navegador continua guardando somente esse UUID por cliente/aba, sem token, documento ou endereço. A autorização da consulta permanece no backend.

O identificador salvo é validado como UUID; valores inválidos, chaves de outro cliente e armazenamento bloqueado não habilitam o atalho. Com armazenamento bloqueado, a consulta da tentativa atual continua disponível em memória, mas não há retomada automática após recarregar. A recuperação depende da mesma aba/navegador e da sessão do cliente, não substitui conciliação nem um histórico completo de tentativas no servidor.

Uma consulta que retorna `status=shipped` e `payment_status=approved` também apresenta pagamento confirmado e acesso aos pedidos. Isso distingue um pedido já enviado de um pagamento ainda pendente; a interface não altera seu andamento operacional.

Quando o Laravel recusa a opção de entrega com validação 422 em `shipping_option_id`, a tela descarta as cotações e exige novo cálculo/seleção. Preserva o endereço e permite uma nova tentativa somente após corrigir o frete. Respostas indeterminadas continuam preservando a chave e o payload originais. A cotação tem limite de espera de 15 segundos no navegador e bloqueia envio duplicado enquanto está em andamento; a configuração pública do checkout tem limite de 10 segundos. Esses limites não foram aplicados à cobrança nem usados para interpretar timeout como pagamento recusado.

A suíte de navegador foi ampliada para doze cenários simulados, incluindo recuperação de cotação indisponível, alteração de frete, retomada com sacola vazia, pedido já enviado, isolamento por cliente e armazenamento bloqueado. O backend, contratos de pagamento, webhooks, estoque e os adaptadores dos provedores não foram alterados nesta revisão. Continuam pendentes os testes Laravel e a homologação real de sandbox, notificações, frete e MySQL.
