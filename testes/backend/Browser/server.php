<?php

use Illuminate\Http\Request;

// Router exclusivo do smoke test. Não incluir em public/ ou em servidores de produção.
$app = require __DIR__.'/environment.php';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/') || str_starts_with($path, '/sanctum/') || $path === '/up') {
    $app->handleRequest(Request::capture());

    return;
}

if (! in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    http_response_code(405);

    return;
}
$dist = realpath(dirname(__DIR__, 3).'/frontend/dist');
$file = $dist ? realpath($dist.rawurldecode($path)) : false;
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($file && str_starts_with($file, $dist.DIRECTORY_SEPARATOR) && is_file($file) && basename($file) !== 'index.html') {
    $types = ['js' => 'text/javascript', 'css' => 'text/css', 'png' => 'image/png', 'svg' => 'image/svg+xml', 'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'woff2' => 'font/woff2', 'ico' => 'image/x-icon'];
    $extension = pathinfo($file, PATHINFO_EXTENSION);
    if (! isset($types[$extension])) {
        http_response_code(404);

        return;
    }
    header('Content-Type: '.$types[$extension]);
    readfile($file);

    return;
}
header('Content-Type: text/html; charset=UTF-8');
echo preg_replace('/(<body\b[^>]*>)/', '$1<aside role="status" style="padding:12px;background:var(--ui-warning-soft,#fef3c7);color:var(--ui-warning-ink,#78350f);text-align:center">Teste integrado local — dados fictícios em banco temporário. Serviços externos bloqueados.</aside>', file_get_contents($dist.'/index.html'), 1);
