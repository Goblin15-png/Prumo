<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckDistributor
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->user()?->role === 'customer' && $request->user()->is_distributor, 403);

        return $next($request);
    }
}
