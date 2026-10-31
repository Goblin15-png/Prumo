<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
class AuditAdminActions {
    public function handle(Request $request, Closure $next): Response {
        if (!in_array($request->method(), ['POST','PUT','PATCH','DELETE'], true)) return $next($request);
        try {
            return DB::transaction(function () use ($request, $next): Response {
                $response = $next($request);
                if ($response->getStatusCode() >= 400) return $response;
                DB::table('security_audit_logs')->insert([
                    'admin_user_id' => $request->user()->id,
                    'action' => $request->method().' '.$request->route()?->uri(),
                    'method' => $request->method(),
                    'route' => $request->route()?->uri() ?? $request->path(),
                    'status_code' => $response->getStatusCode(),
                    'ip_address' => $request->ip(), 'created_at' => now(),
                ]);
                return $response;
            });
        } catch (\Throwable $exception) {
            Log::critical('Falha em operação administrativa auditada.', [
                'route' => $request->route()?->uri(), 'exception' => get_class($exception),
            ]);
            return response()->json(['message' => 'Operação indisponível. Tente novamente mais tarde.'], 503);
        }
    }
}
