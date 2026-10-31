<?php

namespace App\Http\Middleware;

use App\Auth\SessionContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class SelectSessionContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $guard = SessionContext::forRequest($request) === 'admin' ? 'admin' : 'web';
        Auth::shouldUse($guard);
        config(['sanctum.guard' => [$guard]]);

        return $next($request);
    }
}
