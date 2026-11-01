<?php

use App\Http\Controllers\StorefrontController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Somente rotas da interface; APIs e arquivos inexistentes não viram HTML SPA.
Route::get('/', StorefrontController::class);
Route::get('/admin/{path?}', StorefrontController::class)->where('path', '[a-zA-Z0-9/_-]*');
Route::get('/reset-password', StorefrontController::class);

Route::get('/reset-password/{token}', function (Request $request, string $token) {
    $frontend = rtrim((string) config('app.frontend_url'), '/');
    $fragment = http_build_query(['token' => $token, 'email' => $request->query('email')]);

    return redirect()->away("{$frontend}/reset-password#{$fragment}");
})->name('password.reset');
