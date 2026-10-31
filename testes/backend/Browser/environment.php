<?php

// Ferramenta de testes, fora de public/: nunca é carregada pela aplicação normal.
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PragmaRX\Google2FA\Google2FA;

$directory = realpath((string) getenv('PROTOCOLAR_BROWSER_DIR'));
$temporaryRoot = realpath(sys_get_temp_dir());
if (! $directory || dirname($directory) !== $temporaryRoot || ! str_starts_with(basename($directory), 'protocolar-integration-')) {
    throw new RuntimeException('O teste exige um diretório temporário exclusivo.');
}
$credentialsPath = $directory.'/credentials.json';
$credentials = json_decode(file_get_contents($credentialsPath), true, flags: JSON_THROW_ON_ERROR);
$origin = (string) getenv('PROTOCOLAR_BROWSER_ORIGIN');
if (! preg_match('#^http://127\.0\.0\.1:[0-9]+$#', $origin)) {
    throw new RuntimeException('O teste só pode usar um servidor local.');
}

require dirname(__DIR__, 3).'/backend/vendor/autoload.php';

$checkoutPreview = getenv('PROTOCOLAR_PREVIEW_CHECKOUT') === '1';
$realPostalCodes = $checkoutPreview && getenv('PROTOCOLAR_PREVIEW_REAL_CEP') === '1';

// Sobrescreve variáveis herdadas e caches ANTES do bootstrap. Não lê o .env do projeto.
$environment = [
    'APP_ENV' => 'local', 'APP_DEBUG' => 'false', 'APP_KEY' => $credentials['appKey'],
    'APP_URL' => $origin, 'FRONTEND_URL' => $origin,
    'APP_CONFIG_CACHE' => $directory.'/config.php', 'APP_ROUTES_CACHE' => $directory.'/routes.php',
    'APP_EVENTS_CACHE' => $directory.'/events.php', 'APP_SERVICES_CACHE' => $directory.'/services.php',
    'APP_PACKAGES_CACHE' => $directory.'/packages.php',
    'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $directory.'/test.sqlite', 'DB_URL' => '',
    'DB_FOREIGN_KEYS' => 'true', 'CACHE_STORE' => 'database', 'DB_CACHE_CONNECTION' => 'sqlite',
    'SESSION_DRIVER' => 'database', 'SESSION_CONNECTION' => 'sqlite', 'SESSION_TABLE' => 'sessions',
    'SESSION_COOKIE' => 'protocolar_browser_'.substr(hash('sha256', $directory), 0, 12),
    'SESSION_DOMAIN' => 'null', 'SESSION_SECURE_COOKIE' => 'false', 'SESSION_ENCRYPT' => 'true',
    'SANCTUM_STATEFUL_DOMAINS' => parse_url($origin, PHP_URL_HOST).':'.parse_url($origin, PHP_URL_PORT),
    'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync', 'LOG_CHANNEL' => 'null',
    'LOCAL_TEST_MODE' => $checkoutPreview ? 'true' : 'false',
    'STORE_PICKUP_ENABLED' => $checkoutPreview ? 'true' : 'false',
    'STORE_PICKUP_INSTRUCTIONS' => $checkoutPreview ? 'Retirada de teste em local fictício. Nenhuma retirada real será agendada.' : '',
    'MERCADO_PAGO_PUBLIC_KEY' => '', 'MERCADO_PAGO_ACCESS_TOKEN' => '', 'MERCADO_PAGO_WEBHOOK_SECRET' => '',
    'MELHOR_ENVIO_TOKEN' => '', 'ANDROMEDA_GEMINI_API_KEY' => '',
    'CORREIOS_ACCESS_TOKEN' => $checkoutPreview ? 'fixture-correios-token' : '',
    'POSTAL_CODE_PROVIDER' => $realPostalCodes ? 'viacep' : 'correios',
];
foreach ($environment as $name => $value) {
    putenv($name.'='.$value);
    $_ENV[$name] = $_SERVER[$name] = $value;
}
$app = require dirname(__DIR__, 3).'/backend/bootstrap/app.php';
$app->useEnvironmentPath($directory);
$app->useStoragePath($directory.'/storage');
$app->make(Kernel::class)->bootstrap();
Http::preventStrayRequests();
config(['services.postal_code.simulated' => ! $realPostalCodes]);
if ($realPostalCodes) {
    Http::allowStrayRequests(['https://viacep.com.br/ws/*/json/']);
} elseif ($checkoutPreview) {
    Http::fake([
        'https://api.correios.com.br/cep/v2/enderecos*' => function ($request) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return Http::response(['itens' => ($query['cep'] ?? '') === '00000000' ? [[
                'cep' => '00000000', 'logradouro' => 'Rua Fictícia', 'bairro' => 'Bairro Modelo',
                'localidade' => 'Cidade Fictícia', 'uf' => 'PA', 'complemento' => '- lado par',
            ]] : []]);
        },
    ]);
}

if (config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== $directory.'/test.sqlite') {
    throw new RuntimeException('Banco isolado não confirmado.');
}

if (PHP_SAPI === 'cli') {
    switch ($argv[1] ?? '') {
        case 'setup':
            // Recusa banco reutilizado; nunca usa migrate:fresh ou apaga tabelas existentes.
            if (! is_file($directory.'/test.sqlite') || filesize($directory.'/test.sqlite') !== 0) {
                throw new RuntimeException('O banco de testes precisa ser novo e vazio.');
            }
            Artisan::call('migrate', ['--force' => true]);
            $secret = app(Google2FA::class)->generateSecretKey();
            $credentials['otpSecret'] = $secret;
            file_put_contents($credentialsPath, json_encode($credentials, JSON_THROW_ON_ERROR));
            foreach (['owner', 'customer', 'other'] as $profile) {
                $user = User::create([
                    'name' => $profile === 'owner' ? 'Proprietário fictício' : 'Cliente fictício '.$profile,
                    'email' => $profile.'@example.invalid', 'password' => $credentials['password'],
                    'role' => $profile === 'owner' ? 'admin' : 'customer',
                ]);
                $user->forceFill(['email_verified_at' => now()])->save();
                if ($profile === 'owner') {
                    $user->forceFill([
                        'admin_profile' => 'owner', 'two_factor_secret' => $secret,
                        'two_factor_confirmed_at' => now(), 'password_reset_required' => false,
                    ])->save();
                }
            }
            $product = Product::create(['name' => 'Blend de teste integrado', 'slug' => 'blend-teste-integrado', 'price' => 49.9, 'stock' => 8, 'is_active' => true]);
            $floral = Category::create(['name' => 'Aromas florais (teste)', 'slug' => 'aromas-florais-teste', 'sort_order' => 0, 'active' => true]);
            $citrus = Category::create(['name' => 'Aromas cítricos (teste)', 'slug' => 'aromas-citricos-teste', 'sort_order' => 1, 'active' => true]);
            $product->categories()->attach([$floral->id => ['sort_order' => 0], $citrus->id => ['sort_order' => 1]]);
            $other = Product::create(['name' => 'Blend Floral (teste)', 'slug' => 'blend-floral-teste', 'price' => 39.9, 'stock' => 6, 'is_active' => true, 'short_description' => 'Produto fictício para conferir o catálogo e a edição.']);
            $other->categories()->attach($floral->id, ['sort_order' => 1]);
            foreach (['delivery', 'pickup', 'pending'] as $method) {
                $order = Order::create([
                    'user_id' => User::where('email', 'customer@example.invalid')->value('id'),
                    'order_number' => 'PC-INTEGRACAO-'.strtoupper($method), 'total_price' => 49.9,
                    'status' => $method === 'pending' ? 'pending' : 'paid',
                    'payment_status' => $method === 'pending' ? 'pending' : 'approved',
                    'payment_method' => 'pix', 'stock_reserved' => true, 'shipping_cost' => 0,
                    'shipping_method' => $method === 'pickup' ? 'Retirada fictícia' : 'Entrega fictícia',
                ]);
                $order->forceFill(['fulfillment_method' => $method === 'pickup' ? 'pickup' : 'delivery'])->save();
                $order->items()->create(['product_id' => $product->id, 'product_name' => $product->name, 'unit_price' => 49.9, 'quantity' => 1, 'subtotal' => 49.9]);
            }
            echo "Banco temporário preparado com dados fictícios.\n";
            break;
        case 'otp':
            echo app(Google2FA::class)->getCurrentOtp($credentials['otpSecret']);
            break;
        case 'verify':
            $delivery = Order::where('order_number', 'PC-INTEGRACAO-DELIVERY')->firstOrFail();
            $pickup = Order::where('order_number', 'PC-INTEGRACAO-PICKUP')->firstOrFail();
            if ($delivery->fulfillment_status !== 'preparing' || $delivery->fulfillment_revision !== 2
                || $delivery->tracking_code !== null || $delivery->status !== 'paid'
                || $delivery->payment_status !== 'approved' || $delivery->fulfillmentEvents()->count() !== 2
                || $pickup->fulfillment_status !== 'collected' || $pickup->fulfillment_revision !== 1
                || $pickup->fulfillmentEvents()->count() !== 1 || Product::firstOrFail()->stock !== 8
                || DB::table('security_audit_logs')->where('method', 'PATCH')->where('status_code', 200)->count() !== 3) {
                throw new RuntimeException('Persistência ou auditoria divergente no banco temporário.');
            }
            echo "Persistência, histórico, auditoria e estoque conferidos diretamente no SQLite.\n";
            break;
        default:
            throw new RuntimeException('Ação de teste desconhecida.');
    }
}

return $app;
