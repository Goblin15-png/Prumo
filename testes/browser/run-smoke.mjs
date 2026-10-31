// Orquestra as duas prévias locais necessárias para o smoke, encerrando ambas ao terminar.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const jobs = [
  spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: `${root}frontend`, stdio:'ignore' }),
  spawn('node', ['../frontend/node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.config.js'], { cwd:`${root}testes`, stdio:'ignore' }),
];

try {
  for (const port of [4173,4174]) {
    let ready = false;
    for (let i=0;i<100;i++) {
      try { ready=(await fetch(`http://127.0.0.1:${port}`)).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise((done)=>setTimeout(done,100));
    }
    if (!ready) throw new Error(`Prévia ${port} indisponível.`);
  }
  const smoke = spawn('node',['testes/browser/browser-smoke.mjs'],{cwd:root,stdio:'inherit',env:process.env});
  const [code] = await once(smoke,'exit');
  process.exitCode=code ?? 1;
} finally { for (const job of jobs) job.kill('SIGTERM'); }
