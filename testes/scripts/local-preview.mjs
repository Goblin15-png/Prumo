// Prévia integrada descartável. --real-cep permite apenas consultas públicas ao ViaCEP.
// Nunca lê o .env do backend, cria cobranças ou contrata envios.
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const realPostalCodes = args.includes('--real-cep');
const positional = args.filter((arg) => arg !== '--real-cep');
if (positional.length > 1) throw new Error('Uso: npm --prefix testes run local -- [porta] [--real-cep]');
const port = Number(positional[0] || 4180);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Informe uma porta local entre 1024 e 65535.');
const origin = `http://127.0.0.1:${port}`;
let directory;
let server;
let stopping = false;
const stop = () => { stopping = true; server?.kill('SIGTERM'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  const probe = createServer();
  probe.listen(port, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise((resolveClose) => probe.close(resolveClose));
  execFileSync('npm', ['run', 'build'], {
    cwd: join(root, 'frontend'), stdio: 'inherit',
    env: { ...process.env, VITE_API_BASE_URL: '/api/v1' },
  });
  directory = await mkdtemp(join(tmpdir(), 'protocolar-integration-'));
  await mkdir(join(directory, 'storage/framework/views'), { recursive: true });
  const customerPassword = randomBytes(24).toString('hex');
  await writeFile(join(directory, 'credentials.json'), JSON.stringify({
    password: customerPassword, appKey: `base64:${randomBytes(32).toString('base64')}`,
  }), { mode: 0o600, flag: 'wx' });
  await writeFile(join(directory, 'customer-access.txt'), `Conta fictícia para testar esta prévia local\nEmail: customer@example.invalid\nSenha: ${customerPassword}\n`, { mode: 0o600, flag: 'wx' });
  await writeFile(join(directory, 'test.sqlite'), '', { mode: 0o600, flag: 'wx' });
  const env = { PATH: process.env.PATH, PROTOCOLAR_BROWSER_DIR: directory, PROTOCOLAR_BROWSER_ORIGIN: origin, PROTOCOLAR_PREVIEW_CHECKOUT: '1', PROTOCOLAR_PREVIEW_REAL_CEP: realPostalCodes ? '1' : '0' };
  execFileSync('php', [join(root, 'testes/backend/Browser/environment.php'), 'setup'], { env, cwd: root, stdio: 'ignore' });
  if (stopping) throw new Error('Inicialização interrompida.');
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', join(root, 'frontend/dist'), join(root, 'testes/backend/Browser/server.php')], { env, cwd: root, stdio: 'ignore' });
  const exited = once(server, 'exit');
  let ready = false;
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/api/v1/products`, { signal: AbortSignal.timeout(2000) });
      ready = response.ok && Array.isArray((await response.json()).data);
    } catch { /* aguarda Laravel iniciar */ }
    if (ready) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (!ready) throw new Error('A API local não iniciou. Confira a disponibilidade da porta e do PHP com PDO SQLite.');
  const accessDirectory = join(root, 'testes/.local');
  const accessFile = join(accessDirectory, 'acesso.txt');
  await mkdir(accessDirectory, { recursive: true, mode: 0o700 });
  await chmod(accessDirectory, 0o700);
  await writeFile(accessFile, `Acesso exclusivo desta prévia local de testes\nLoja: ${origin}/\nCliente: customer@example.invalid\nAdministrador: owner@example.invalid (exige MFA)\nSenha das contas fictícias: ${customerPassword}\n\nAtualizado a cada inicialização. Válido somente enquanto esta prévia estiver rodando.\n`, { mode: 0o600 });
  await chmod(accessFile, 0o600);
  console.log(`\nLoja integrada: ${origin}/\nPainel: ${origin}/admin\nDemonstração visual separada: npm --prefix testes run dev`);
  console.log('Catálogo, frete e pagamento fictícios em SQLite temporário; nenhuma cobrança ou envio.');
  console.log(realPostalCodes ? 'CEP: consulta real ao ViaCEP habilitada. Demais serviços externos bloqueados.' : 'CEP fictício: 00000-000. Serviços externos bloqueados. Use --real-cep para consultar CEPs reais no ViaCEP.');
  console.log(`Contas fictícias: owner@example.invalid e customer@example.invalid. Credenciais geradas no arquivo privado ${directory}/credentials.json`);
  console.log(`Acesso do cliente de teste: ${directory}/customer-access.txt`);
  console.log(`Arquivo de acesso no projeto: ${accessFile}`);
  console.log('Ctrl+C encerra a prévia e descarta os dados desta execução.');
  const [code, signal] = await exited;
  if (!stopping && (code !== 0 || signal)) throw new Error('O servidor local foi encerrado inesperadamente.');
} catch (error) {
  if (!stopping) {
    console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso. Informe outra: npm --prefix testes run local -- 4181` : (error.code ? `Não foi possível iniciar a prévia local (${error.code}).` : error.message));
    process.exitCode = 1;
  }
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await closed;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
}
