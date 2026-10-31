<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckAdminRole
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $user->role !== 'admin') {
            return response()->json([
                'message' => 'Acesso negado. Esta área é restrita aos administradores da farmácia botânica.',
            ], 403);
        }

        if ($user->password_reset_required) {
            return response()->json(['code' => 'ADMIN_REAUTH_REQUIRED', 'message' => 'Redefina a senha da conta administrativa para continuar.'], 403);
        }

        if (! $request->hasSession() || (int) $request->session()->get('admin_mfa_confirmed_user_id') !== (int) $user->id || (int) $request->session()->get('admin_mfa_confirmed_at', 0) < now()->subHours(8)->getTimestamp()) {
            return response()->json(['code' => 'ADMIN_REAUTH_REQUIRED', 'message' => 'Autenticação em duas etapas necessária.'], 403);
        }

        if (! in_array($user->admin_profile, ['owner', 'technical'], true) || $request->session()->get('admin_mfa_confirmed_profile') !== $user->admin_profile || (int) $request->session()->get('admin_mfa_access_version', -1) !== (int) $user->admin_access_version) {
            return response()->json(['code' => 'ADMIN_ACCESS_CHANGED', 'message' => 'Perfil administrativo não atribuído ou alterado. Entre novamente após a atribuição pelo responsável técnico.'], 403);
        }

        return $next($request);
    }
}
