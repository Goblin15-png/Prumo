import { pathToFileURL } from 'node:url';

export function assessRuntime(response, data) {
  if (response.status !== 200) return `API respondeu HTTP ${response.status}; confira proxy e logs do Laravel.`;
  if (!response.headers.get('content-type')?.includes('application/json')) return 'API devolveu HTML ou outro formato; confira o proxy, não o React.';
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.local_test_mode !== 'boolean') return 'JSON não corresponde ao contrato runtime-config do Laravel.';
  if (data.local_test_mode) return 'Modo simulado está ativo; confira APP_ENV e LOCAL_TEST_MODE.';
  return null;
}

export function assessCsrf(response) {
  if (response.status !== 204) return `CSRF respondeu HTTP ${response.status}; confira a rota /sanctum/csrf-cookie.`;
  const cookies = response.headers.getSetCookie();
  const csrf = cookies.find(value => value.startsWith('XSRF-TOKEN='));
  const sessions = cookies.filter(value => !value.startsWith('XSRF-TOKEN=') && /;\s*httponly(?:;|$)/i.test(value));
  if (!csrf || !sessions.length) return 'Cookies CSRF/sessão ausentes; confira Sanctum e SESSION_DRIVER.';
  if ([csrf,...sessions].some(value => !/;\s*secure(?:;|$)/i.test(value) || /;\s*domain=/i.test(value))) return 'Cookies precisam de Secure e ausência de Domain; confira SESSION_DOMAIN=null.';
  if (/;\s*httponly(?:;|$)/i.test(csrf)) return 'XSRF-TOKEN deve ser legível pelo Axios (sem HttpOnly).';
  return null;
}

export async function checkPublic(base, frontend, send = fetch) {
  const results = [];
  for (const [path,kind] of [['/api/v1/runtime-config','runtime'],['/sanctum/csrf-cookie','csrf']]) {
    try {
      const response = await send(new URL(path,base), {
        method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(60_000),
        headers:{Accept:'application/json',Origin:frontend,Referer:frontend+'/'},
      });
      // Não imprimir corpo, cookies ou credenciais. Só verificar o contrato público.
      let data;
      if (kind === 'runtime' && response.headers.get('content-type')?.includes('application/json')) {
        try { data = await response.json(); } catch { /* Erro de contrato abaixo. */ }
      }
      const error = kind === 'runtime' ? assessRuntime(response,data) : assessCsrf(response);
      results.push({path,ok:!error,message:error || `HTTP ${response.status}; contrato esperado confirmado.`});
      await response.body?.cancel().catch(() => {});
    } catch {
      results.push({path,ok:false,message:'Falha de rede/timeout; confira disponibilidade e tente novamente.'});
    }
  }
  return results;
}

function publicOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Informe somente origem HTTPS pública, sem caminho ou credenciais.');
  return url.origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const frontend = publicOrigin(process.argv[2] || 'https://prumo.bernadin15-dev.workers.dev');
    const backend = publicOrigin(process.argv[3] || 'https://prumo-backend-x6w9.onrender.com');
    let passed = true;
    for (const [name,base] of [['Laravel',backend],['Cloudflare',frontend]]) {
      console.log(`${name}: ${base}`);
      for (const result of await checkPublic(base,frontend)) {
        console.log(`${result.ok ? 'OK' : 'FALHOU'} ${result.path}: ${result.message}`);
        passed &&= result.ok;
      }
    }
    console.log('Verificação GET somente: não testa criação de conta, email, MFA ou acesso direto ao PostgreSQL.');
    process.exitCode = passed ? 0 : 1;
  } catch {
    console.error('Uso: npm --prefix testes run check:deploy -- https://FRONTEND https://BACKEND (somente origens HTTPS, sem credenciais).');
    process.exitCode = 1;
  }
}
