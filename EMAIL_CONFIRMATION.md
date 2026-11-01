# Confirmação de email — PRUMA ESSENTIAL

O remetente fixo da confirmação é `bernadin15.dev@gmail.com`. O destinatário é o email do usuário autenticado, cadastrado no servidor; o navegador não escolhe destinatário ou remetente no reenvio. Não há envio habilitado automaticamente por este PR.

## Fluxo

Cadastro cria cliente não confirmado e tenta enviar código de seis dígitos. O cliente autenticado informa o código no formulário da loja; `POST /api/v1/email/confirm-code` recebe somente `code`. A confirmação atualiza a conta retornada e libera os recursos já protegidos por email verificado. Não modifica MFA nem sessões administrativas.

Código aleatório válido por 10 minutos, armazenado somente como hash oculto na API. Cinco erros bloqueiam o código. Reenvio substitui o hash, exige 60 segundos e é limitado por conta/IP (até cinco por hora no endpoint). Atualização e tentativas usam transação/bloqueio de linha. Não há código em respostas JSON ou logs da aplicação. Se o transporte falhar, o código é invalidado e a API não anuncia entrega. A conta criada permanece existente; use login/reenvio, sem repetir o cadastro. O modo local isolado continua dispensando confirmação.

Links assinados antigos permanecem aceitos para compatibilidade; novos envios usam apenas código. Transportes log/array/failover são recusados para códigos em APP_ENV=production. Não use mailer log com códigos reais em outros ambientes.

## Obter senha de app Gmail

1. Entre na conta `bernadin15.dev@gmail.com`.
2. Acesse https://myaccount.google.com/security e ative a verificação em duas etapas.
3. Acesse https://myaccount.google.com/apppasswords, confirme o login e crie uma senha para `PRUMA ESSENTIAL`.
4. Copie a senha gerada e informe-a somente em MAIL_PASSWORD nas variáveis do backend. Não use a senha normal do Gmail nem envie a senha pelo chat, GitHub ou frontend.
5. Se a opção não aparecer, confira a conta selecionada e a verificação em duas etapas. Contas organizacionais, Proteção Avançada e configuração apenas com chaves de segurança podem restringir esse recurso. Não desative proteções para contornar a restrição.

Fonte: https://support.google.com/accounts/answer/185833?hl=pt-BR

## Atenção ao Render gratuito

O Render gratuito bloqueia saída SMTP nas portas 25, 465 e 587. A senha de app não remove o bloqueio. Para Gmail SMTP, use backend hospedado em serviço que permita essas conexões (incluindo plano Render compatível). A alternativa em Render gratuito é transporte de email por API HTTPS, que exige configuração/credenciais próprias e validação do remetente; não basta trocar MAIL_PORT. Nenhuma assinatura paga foi contratada e não há API Gmail OAuth implementada neste PR.

Fonte: https://render.com/docs/free

## Configuração SMTP (somente com saída permitida)

Em Environment do backend, configurar os valores abaixo, preenchendo MAIL_PASSWORD privadamente. Remover MAIL_URL antigo que possa sobrescrevê-los.

```ini
MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_USERNAME=bernadin15.dev@gmail.com
MAIL_FROM_ADDRESS=bernadin15.dev@gmail.com
MAIL_FROM_NAME="PRUMA ESSENTIAL"
```

`MAIL_PASSWORD` recebe a senha de app sem os espaços de exibição. O remetente deve continuar essa conta. SMTP é síncrono com timeout de 15 segundos: não depende de worker de fila. Gmail aplica limites de envio; este preparo não homologa volume nem entrega em caixa de entrada.

## Implantação e validação

1. Publicar primeiro o proxy do PR #9 e as variáveis de sessão/URL descritas em CLOUDFLARE.md.
2. Revisar e aplicar a nova migração **aditiva**, que acrescenta quatro campos em users. Não usa reset/fresh nem converte dados existentes. Fazer backup e aplicar no processo de deploy aprovado: `php artisan migrate --force`. O Dockerfile atual inicia Apache diretamente; a existência de docker/migrate-and-start.sh não significa que esteja sendo chamado. Não houve execução em produção por este PR.
3. Atualizar cache de configuração conforme processo da hospedagem (`php artisan config:cache`) após preencher segredos. Preservar APP_KEY existente.
4. Publicar frontend/backend compatíveis e testar em homologação com conta fictícia e caixa de email controlada: cadastro, recebimento, erro de código, confirmação, expiração, reenvio, login e checkout bloqueado até confirmar. Conferir remetente e destinatário sem expor o código em logs.
5. Para contas antigas não confirmadas, entrar e solicitar reenvio. Recuperação de senha continua sendo fluxo separado e usa o transporte global configurado.

## Verificação local

`npm --prefix frontend run build` e `npm --prefix testes test`.

Com PHP 8.4, extensões e Composer instalados: `npm --prefix testes run test:php -- --filter 'EmailVerificationCodeTest|SecurityControlsTest'`. Testes usam SQLite em memória e notificações falsas, sem SMTP, banco ou email real. O workflow email-confirmation.yml executa esse recorte no GitHub. Passar esses testes não comprova entrega Gmail ou execução em PostgreSQL real.
