# Preenchimento de endereço por CEP

A consulta usa o CEP de oito dígitos para obter rua, bairro, cidade e UF. CPF não é um parâmetro da API Busca CEP. Nome do destinatário, telefone, número e complemento continuam sendo informados pelo cliente. O campo `complemento` dos Correios pode descrever um trecho da rua, por exemplo “lado par”, e não deve ser copiado para o complemento da residência.

O checkout definitivo (`frontend/src/components/CheckoutPage.jsx`) consulta após digitar os oito dígitos e uma pausa de 350 ms. Os campos permanecem editáveis. Respostas de um CEP anterior são ignoradas; alterações manuais feitas durante a consulta são preservadas. Ao trocar o CEP, a tela limpa os valores ainda preenchidos automaticamente e invalida a cotação anterior. O botão de calcular frete mantém seu fluxo independente.

O provedor padrão agora é o **ViaCEP**, autorizado para permitir consultas reais sem contrato dos Correios. A integração dos Correios continua disponível como opção explícita. O navegador consulta apenas o backend da loja; o backend consulta o provedor selecionado.

## Configuração no servidor — ViaCEP

No ambiente do backend, configure:

```dotenv
POSTAL_CODE_PROVIDER=viacep
```

Esse é também o padrão quando a variável não está definida. Conforme a [documentação oficial do ViaCEP](https://viacep.com.br/), a consulta é pública e não exige token. O servidor usa `GET https://viacep.com.br/ws/{cep}/json/`, com oito dígitos. Não envia credenciais dos Correios ou de outros serviços. Uma resposta com `erro: true` ou `erro: "true"` é tratada como CEP não encontrado. CEP, cidade e UF são validados antes do preenchimento; CEP municipal pode não ter rua ou bairro.

Endereços válidos são armazenados no cache configurado do Laravel por até 24 horas, com chaves separadas por provedor e CEP. Somente dados públicos do endereço entram no cache; erros não são armazenados. O limite de 20 consultas por minuto/IP continua sendo aplicado mesmo quando há resultado em cache. Uma mudança cadastral no provedor pode levar até 24 horas para aparecer na loja. Configurações de provedor diferentes de `viacep` ou `correios` retornam indisponibilidade, sem consultar outro host.

Após mudar variáveis em um ambiente com configuração em cache, execute `php artisan config:cache` no backend durante a atualização da aplicação.

## Configuração no servidor — Correios

O [manual oficial Busca CEP](https://www.correios.com.br/atendimento/developers/manuais/manual-api-busca-cep) exige conta PJ, contrato comercial com o serviço API BUSCA CEP (86738), e autenticação Bearer. O manual permite chave de acesso subdelegada como token. Esta implementação usa essa opção, ou um token válido gerado externamente com autorização por contrato.

Configure somente no ambiente do backend, sem publicar o valor:

```dotenv
POSTAL_CODE_PROVIDER=correios
CORREIOS_ACCESS_TOKEN=
```

Não use variáveis `VITE_*`. A credencial não aparece no runtime-config nem na resposta da consulta. O host de consulta é fixo: `https://api.correios.com.br`, ambiente de produção dos Correios. Não há seleção de homologação ou emissão automática de token nesta implementação. O cadastro, a contratação e a obtenção da credencial devem ser feitos no [CWS dos Correios](https://cws.correios.com.br/).

Se for usado token temporário, seu processo de operação precisa renová-lo antes da expiração e atualizar a configuração do servidor. Conforme o [manual API Token](https://www.correios.com.br/atendimento/developers/manuais/manual-uso-da-api-token), o token para Busca CEP deve ser gerado com `POST /token/v1/autentica/contrato`, autenticação Basic com credenciais do CWS e corpo contendo `numero` do contrato (`dr` é opcional). Esse fluxo de geração não é executado pela loja. Uma chave subdelegada também precisa permanecer válida e ser substituída se expirar ou for revogada.

## Contrato implementado

`GET /api/v1/postal-codes/{cep}` é público, com limite de 20 consultas por minuto/IP. Aceita `00000000` ou `00000-000` e normaliza para oito dígitos. Retorno sem wrapper:

```json
{
  "postal_code": "00000000",
  "street": "Rua Fictícia",
  "neighborhood": "Bairro Modelo",
  "city": "Cidade Fictícia",
  "state": "PA"
}
```

O exemplo é fictício e não é uma resposta real dos Correios. CEP municipal pode retornar rua e bairro vazios, permitindo preenchimento manual.

Com o provedor Correios selecionado, o backend usa `GET /cep/v2/enderecos?cep={cep}&size=2`, o endpoint de lista e filtro explicitamente documentado no manual, e aceita apenas um resultado correspondente ao CEP consultado. Não escolhe o primeiro resultado de uma resposta ambígua. Ambos os provedores usam hosts fixos e não seguem redirecionamentos; limitam conexão a 3 segundos e requisição a 6 segundos. Nenhum campo de credencial, dado extra do provedor, número de imóvel ou complemento é devolvido.

Falhas retornam `422` para formato inválido, `404` para CEP não encontrado e `503` para indisponibilidade, credencial ausente/expirada ou resposta inconsistente. As mensagens orientam preenchimento manual e não expõem o corpo de erro do provedor.

## Validação e limites

Os testes de contrato estão em `testes/backend/Feature/PostalCodeLookupTest.php` (Correios) e `testes/backend/Feature/ViaCepPostalCodeLookupTest.php` (ViaCEP), com HTTP simulado; cobrem resposta filtrada, CEP normalizado, ausência ou não envio de credenciais, formato inválido/CPF, CEP municipal, falhas, timeout, respostas inconsistentes, cache por provedor, expiração e limite de consultas. As simulações permanecem dentro de `testes/`.

Na prévia integrada padrão (`npm --prefix testes run local`), o CEP fictício `00000-000` preenche endereço fictício. Outros CEPs retornam não encontrado. Para testar preenchimento com CEPs reais pelo ViaCEP, inicie com `npm --prefix testes run local -- --real-cep`. Essa opção permite apenas a consulta pública de CEP; pedidos, pagamentos e frete da prévia continuam simulados. O teste `testes/browser/browser-checkout.mjs` verifica o preenchimento e a preservação dos dados pessoais, trocas de CEP com respostas atrasadas, edição durante a busca e pagamento com endereço manual quando a consulta falha.

Não foram configuradas credenciais, realizadas consultas autenticadas ou feita homologação real com os Correios. Para selecionar esse provedor, é necessário validar o acesso do contrato e a credencial. O ViaCEP permite o preenchimento sem essa contratação. Quando qualquer consulta está indisponível, o checkout continua aceitando endereço preenchido manualmente.
