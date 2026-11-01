// Somente transporte HTTP. Autenticação, CSRF, permissões e regras ficam no Laravel.
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const forwardedHeaders = [
  'accept-language', 'authorization', 'content-type', 'content-encoding', 'cookie', 'origin', 'referer', 'user-agent',
  'x-requested-with', 'x-csrf-token', 'x-xsrf-token', 'x-signature', 'x-request-id',
];
const privateHeaders = (source) => {
  const headers = new Headers(source);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return headers;
};
const problem = (status, code, message) => Response.json({ code, message }, {
  status,
  headers: privateHeaders({ 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }),
});
const isApiNamespace = (path) => ['/api', '/sanctum'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

function backendOrigin(value, publicUrl) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const origin = new URL(value.trim());
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/'
      || origin.search || origin.hash || origin.port || origin.origin === publicUrl.origin
      || !origin.hostname.includes('.') || origin.hostname.endsWith('.local') || origin.hostname.endsWith('.internal')
      || /^[\d.]+$/.test(origin.hostname) || origin.hostname.includes(':')) return null;
    return origin;
  } catch { return null; }
}

export async function handleRequest(request, env, send = fetch) {
  const publicUrl = new URL(request.url);
  if (!isApiNamespace(publicUrl.pathname)) return env.ASSETS.fetch(request);

  const allowedPath = publicUrl.pathname === '/api/v1' || publicUrl.pathname.startsWith('/api/v1/')
    || publicUrl.pathname === '/sanctum/csrf-cookie';
  if (!allowedPath) return problem(404, 'API_ROUTE_NOT_FOUND', 'Rota de API não encontrada.');
  // Não permita que decodificações no origin transformem a rota em outro caminho.
  try {
    const decoded = decodeURIComponent(publicUrl.pathname);
    if (/%(?:25|2f|5c|00)/i.test(publicUrl.pathname) || decoded.includes('\\')
      || decoded.includes('\0') || decoded.split('/').some((part) => part === '.' || part === '..')) {
      return problem(400, 'API_PATH_INVALID', 'Caminho de API inválido.');
    }
  } catch { return problem(400, 'API_PATH_INVALID', 'Caminho de API inválido.'); }
  if (!methods.has(request.method)) return problem(405, 'API_METHOD_NOT_ALLOWED', 'Método não permitido.');

  const origin = backendOrigin(env.LARAVEL_ORIGIN, publicUrl);
  if (!origin) return problem(503, 'API_NOT_CONFIGURED', 'A API Laravel ainda não foi conectada. Entre em contato com o responsável pela loja.');
  // Previews não devem encaminhar operações para a API de produção.
  if (env.FRONTEND_ORIGIN !== publicUrl.origin) {
    return problem(503, 'API_PREVIEW_NOT_CONFIGURED', 'Configure uma API e uma origem pública próprias para este ambiente.');
  }
  const target = new URL(origin);
  target.pathname = publicUrl.pathname;
  target.search = publicUrl.search;
  const headers = new Headers({ Accept: 'application/json', 'Cache-Control': 'no-store' });
  for (const name of forwardedHeaders) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  // Não encaminhar Host/Forwarded/X-Forwarded-* fornecidos pelo cliente.
  // Origin e Referer originais são preservados para Sanctum e validação CSRF.
  headers.set('X-Forwarded-Proto', 'https');
  const clientIp = request.cf && request.headers.get('CF-Connecting-IP');
  if (clientIp && /^[a-fA-F0-9:.]+$/.test(clientIp)) headers.set('X-Forwarded-For', clientIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method) && request.body !== null;
    const upstream = await send(new Request(target, {
      method: request.method, headers,
      ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
      redirect: 'manual', cache: 'no-store', signal: controller.signal,
    }));
    if (upstream.headers.get('content-type')?.toLowerCase().includes('text/html') && !(upstream.status >= 300 && upstream.status < 400)) {
      return problem(502, 'API_RESPONSE_INVALID', 'A API retornou uma resposta inesperada. Tente novamente mais tarde.');
    }
    const responseHeaders = privateHeaders(upstream.headers);
    const location = responseHeaders.get('Location');
    if (location && upstream.status >= 300 && upstream.status < 400) {
      const destination = new URL(location, target);
      if (destination.protocol !== 'https:') return problem(502, 'API_REDIRECT_INVALID', 'A API retornou um redirecionamento inválido.');
      // Redirecionamentos internos continuam no mesmo domínio visto pelo navegador.
      if (destination.origin === origin.origin) {
        const local = new URL(publicUrl.origin);
        local.pathname = destination.pathname;
        local.search = destination.search;
        local.hash = destination.hash;
        responseHeaders.set('Location', local.href);
      }
    }
    // Headers preserva Set-Cookie múltiplos; não combinar cookies separados por vírgula.
    // SESSION_DOMAIN deve ser null no Laravel para os cookies pertencerem ao host público.
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status, statusText: upstream.statusText, headers: responseHeaders,
    });
  } catch {
    // Não registrar credenciais, corpo do cadastro, cookies ou detalhes internos do origin.
    return problem(503, 'API_UNAVAILABLE', 'Não foi possível confirmar a operação com a API. Tente novamente mais tarde; se estiver pagando, consulte a tentativa existente antes de iniciar outra compra.');
  } finally { clearTimeout(timeout); }
}

export default { fetch(request, env) { return handleRequest(request, env); } };
