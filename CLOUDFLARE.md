# Cloudflare descontinuado neste projeto

Em 01/11/2026, o responsável escolheu servir loja, painel e API somente pelo Laravel no Render. O proxy e o arquivo wrangler.json foram removidos. Não executar os comandos antigos de deploy Workers.

A configuração atual está em [LARAVEL_HOSTING.md](LARAVEL_HOSTING.md). A alteração no repositório não apaga/desliga o Worker nem desfaz a integração GitHub na conta Cloudflare. Depois de validar o endereço Laravel, o responsável deve desativar os builds automáticos/desconectar o repositório e excluir o Worker antigo na conta Cloudflare. Nenhuma zona DNS ou domínio externo deve ser removido por causa dessa troca de hospedagem.
