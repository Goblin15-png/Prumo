<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'message' => 'API Protocolo Cuidar está funcionando.',
        'version' => 'v1',
    ]);
});

Route::get('/reset-password/{token}', function (Request $request, string $token) {
    $frontend = rtrim((string) config('app.frontend_url'), '/');
    $fragment = http_build_query(['token' => $token, 'email' => $request->query('email')]);

    return redirect()->away("{$frontend}/reset-password#{$fragment}");
})->name('password.reset');
