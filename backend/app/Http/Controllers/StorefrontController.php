<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

class StorefrontController extends Controller
{
    public function __invoke(): BinaryFileResponse
    {
        $index = public_path('storefront.html');
        abort_unless(is_file($index), 503, 'Interface ainda não compilada. Consulte LARAVEL_HOSTING.md.');

        return response()->file($index, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
        ]);
    }
}
