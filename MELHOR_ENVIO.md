# Melhor Envio — cotação no checkout

A consulta de preços e prazos já está ligada ao checkout definitivo. O navegador envia CEP e IDs/quantidades dos blends para `POST /api/v1/shipping/calculate`; o backend consulta o Melhor Envio com preços, estoque, peso e medidas do banco. Antes do pagamento, o backend faz uma nova cotação e exige que a opção e o valor continuem iguais.

## Onde configurar

1. Entre no [Melhor Envio Sandbox](https://sandbox.melhorenvio.com.br/) para homologação. A conta/token de sandbox é separada da conta/token de [produção](https://melhorenvio.com.br/). As bases e a separação dos ambientes estão na [introdução oficial](https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio).
2. Obtenha um token de acesso autorizado a cotar fretes. Se usar um token emitido diretamente pelo painel, coloque o token no servidor. Para um aplicativo OAuth, siga **Integrações → Área Dev.**, autorização e solicitação de token da [documentação oficial](https://docs.melhorenvio.com.br/reference/fluxo-de-autoriza%C3%A7%C3%A3o); o escopo necessário para esta etapa é `shipping-calculate`. O projeto atual consome um token já emitido e não implementa o callback/renovação OAuth. `Client ID` e `Client Secret` não substituem o token.
3. Preencha as variáveis abaixo no **`backend/.env`** do ambiente integrado, preservando as outras configurações. Token somente no backend, sem o prefixo `Bearer` e sem publicar esse arquivo:

```dotenv
LOCAL_TEST_MODE=false
MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_TOKEN=
STORE_ORIGIN_CEP=
MELHOR_ENVIO_USER_AGENT=
```

`STORE_ORIGIN_CEP` é o CEP de onde saem os pedidos. `MELHOR_ENVIO_USER_AGENT` deve conter nome da aplicação e email técnico de contato, entre aspas no `.env`, por exemplo `"Nome da loja (seu email técnico)"`; substitua o exemplo pelos dados reais. `MELHOR_ENVIO_ENVIRONMENT` aceita apenas `sandbox` ou `production`, sempre com o token correspondente.

4. No painel da loja, abra **Blends → editar blend → Embalagem para cálculo de frete**. Cadastre largura, altura e comprimento em **cm**, peso embalado em **kg**, por unidade. Todos os produtos da sacola precisam desses dados e estoque. A [API de cálculo](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos) usa quantidades e valor unitário; o código prioriza `custom_price` e `custom_delivery_time` retornados pelo provedor.
5. No ambiente integrado, recarregue a configuração com `php artisan config:clear` dentro de `backend/` e reinicie processos persistentes, se houver. Com o site ligado a esse backend, adicione um blend, abra **Sacola → Continuar para o checkout**, informe um CEP válido e clique em **Calcular frete**. Essa consulta não compra etiqueta. Se nenhuma transportadora aparecer, confira os serviços autorizados na conta conforme a [FAQ oficial](https://docs.melhorenvio.com.br/reference/faq).

Para produção, a configuração precisa usar `production` e o token da conta de produção, após homologar o fluxo. Tokens OAuth expiram e exigem renovação; a [documentação de autenticação](https://docs.melhorenvio.com.br/docs/autenticacao-1) descreve o ciclo. A versão atual não renova tokens automaticamente.

## Preview e código

`npm --prefix testes run local` inicia o preview com banco temporário, frete e pagamento simulados; ele não utiliza o token do `backend/.env`. Mudar o `.env` não transforma esse preview em uma integração real. A opção `npm --prefix testes run local -- --real-cep` permite apenas consultar endereços reais pelo ViaCEP; o frete e o pagamento continuam simulados. Para consultar o Melhor Envio, use o backend integrado com as configurações acima.

| Parte | Arquivo |
| --- | --- |
| Configuração privada | `backend/.env`; nomes e exemplos em `backend/.env.example` |
| Leitura da configuração | `backend/config/services.php`, seção `melhor_envio` |
| Validação de CEP e sacola | `backend/app/Http/Controllers/Api/ShippingController.php` |
| HTTP autenticado, dados do banco e tratamento do retorno | `backend/app/Services/ShippingQuoteService.php` |
| Nova cotação antes de pagar | `backend/app/Services/CheckoutService.php` |
| Botão e seleção de frete | `frontend/src/components/CheckoutPage.jsx` |
| Peso e medidas no painel | `frontend/src/components/AdminProductForm.jsx` |
| Testes isolados | `testes/backend/Feature/ShippingQuoteTest.php` |

## Limites atuais

A integração disponível calcula preço/prazo e registra o frete escolhido no pedido. Compra, geração e impressão de etiquetas, coleta e sincronização de rastreio **ainda não estão implementadas**. O painel da loja permite informar o rastreio manualmente. A API de Busca CEP dos Correios é outra integração: `CORREIOS_ACCESS_TOKEN` não serve para o Melhor Envio, e `MELHOR_ENVIO_TOKEN` não autoriza a consulta de endereço dos Correios.

Os testes do repositório usam respostas HTTP simuladas; eles não comprovam que a conta, o token ou a operação de postagem estejam ativos. Nenhum frete ou etiqueta foi contratado nesta implementação.

## Tratamento de falhas na tela

A revisão de 31/10/2026 limita a espera da cotação no navegador a 15 segundos, permite repetir uma consulta indisponível e impede duplicação enquanto ela está em andamento. Se a validação de checkout informar mudança de frete em `shipping_option_id`, as opções antigas são descartadas e o cliente precisa recalcular e selecionar a entrega novamente. Isso preserva o recálculo obrigatório do servidor; não garante preço ou prazo antes da nova cotação. O retorno de sandbox/produção não foi consultado nesta revisão: os cenários novos de interface usam API simulada.
