<?php

namespace App\Http\Middleware;

use App\Auth\SessionContext;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Symfony\Component\HttpFoundation\Cookie;

class ContextCsrfToken extends ValidateCsrfToken
{
    protected function newCookie($request, $config)
    {
        return new Cookie(
            SessionContext::csrfCookie($request), $request->session()->token(),
            $this->availableAt(60 * $config['lifetime']), $config['path'], $config['domain'],
            $config['secure'], false, false, $config['same_site'] ?? null, $config['partitioned'] ?? false,
        );
    }
}
