<?php

namespace App\Auth;

use Illuminate\Http\Request;

final class SessionContext
{
    public static function forRequest(Request $request): string
    {
        return $request->is('api/v1/admin', 'api/v1/admin/*') ? 'admin' : 'customer';
    }

    public static function cookie(string $context): string
    {
        // Nome distinto também impede reutilizar cookies administrativos anteriores à separação.
        return $context === 'admin' ? config('session.cookie').'_admin_v1' : config('session.cookie');
    }

    public static function csrfCookie(Request $request): string
    {
        return self::forRequest($request) === 'admin' ? 'ADMIN-XSRF-TOKEN' : 'XSRF-TOKEN';
    }
}
