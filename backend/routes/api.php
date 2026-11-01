<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AdminSystemController;
use App\Http\Controllers\Api\AdminTwoFactorController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\GeminiController;
use App\Http\Controllers\Api\MercadoPagoWebhookController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PostalCodeController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ShippingController;
use App\Http\Controllers\Api\UserProfileController;
use App\Http\Middleware\AuditAdminActions;
use App\Http\Middleware\CheckAdminRole;
use App\Http\Middleware\CheckCustomerRole;
use App\Models\Category;
use App\Models\Symptom;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

/*
|--------------------------------------------------------------------------
| API Routes - Protocolo Cuidar (Full-Stack E-commerce)
|--------------------------------------------------------------------------
*/

$localTestMode = app()->environment('local') && (bool) config('services.local_test_mode');
$emailVerificationMiddleware = $localTestMode ? [] : ['verified'];

Route::prefix('v1')->group(function () use ($localTestMode, $emailVerificationMiddleware) {

    Route::get('/tracking/{tracker}-noscript', function (Request $request, string $tracker) {
        // O HTML estático também atende /admin; só a página pública pode abrir o iframe.
        $referrer = parse_url((string) $request->header('Referer'));
        $referrerPath = $referrer['path'] ?? null;
        // Com encaminhamento pela Vercel, o Host do Laravel pode ser o do backend.
        $storeOrigin = is_array($referrer)
            && isset($referrer['scheme'], $referrer['host'], $referrerPath)
            && strtolower($referrer['scheme'].'://'.$referrer['host'].(isset($referrer['port']) ? ':'.$referrer['port'] : '')) === strtolower(rtrim((string) config('app.frontend_url'), '/'));
        $publicPage = $storeOrigin && ! preg_match('#^/(admin|reset-password)(/|$)#i', $referrerPath);
        $cookies = array_map('trim', explode(';', (string) $request->header('Cookie')));
        $accepted = in_array('meta-pixel-consent=accepted', $cookies, true)
            && ($tracker === 'meta-pixel' || in_array('google-tag-manager-consent=accepted', $cookies, true));
        $destination = $tracker === 'meta-pixel'
            ? 'https://www.facebook.com/tr?id=1636298474539545&ev=PageView&noscript=1'
            : 'https://www.googletagmanager.com/ns.html?id=GTM-5HTKMSRK';

        $response = $publicPage && $accepted
            ? redirect()->away($destination)
            : response()->noContent();

        return $response->header('Cache-Control', 'private, no-store');
    })->whereIn('tracker', ['meta-pixel', 'google-tag-manager'])->middleware('throttle:api');

    Route::get('/runtime-config', fn () => response()->json([
        'local_test_mode' => $localTestMode,
        'postal_code' => [
            'provider' => config('services.postal_code.provider', 'viacep'),
            'simulated' => (bool) config('services.postal_code.simulated', false),
        ],
        'checkout' => [
            'public_key' => config('services.mercado_pago.public_key'),
            'enabled' => $localTestMode || (bool) (config('services.mercado_pago.access_token') && config('services.mercado_pago.public_key') && config('services.mercado_pago.webhook_secret')),
            'environment' => config('services.mercado_pago.environment'),
            'pickup_enabled' => (bool) config('services.pickup.enabled') && trim((string) config('services.pickup.instructions')) !== '',
            'pickup_instructions' => config('services.pickup.instructions'),
        ],
    ]))->middleware('throttle:api');

    Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware(['signed', 'throttle:email-verification'])
        ->name('verification.verify');

    // 1. ROTAS PÚBLICAS
    // Autenticação & Onboarding
    // Autenticação tem sessão/CSRF mesmo sem Origin; não iniciar o mesmo stack duas vezes.
    Route::middleware(['web', AuthenticateSession::class])->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->group(function () {
        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('/password/forgot', [AuthController::class, 'sendPasswordResetLink'])->middleware('throttle:password-reset');
        Route::post('/password/reset', [AuthController::class, 'resetPassword'])->middleware('throttle:password-reset');
    });

    Route::prefix('admin/auth')->middleware(['web', AuthenticateSession::class])->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->group(function () {
        Route::get('/csrf-cookie', fn () => response()->noContent());
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('/two-factor/confirm-setup', [AdminTwoFactorController::class, 'confirmSetup'])->middleware('throttle:two-factor');
        Route::post('/two-factor/verify', [AdminTwoFactorController::class, 'verify'])->middleware('throttle:two-factor');
        Route::get('/me', [AuthController::class, 'me'])->middleware(['auth:admin', CheckAdminRole::class]);
        Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:admin');
    });

    // Catálogo & Recomendações
    Route::middleware('throttle:api')->group(function () {
        Route::get('/products', [ProductController::class, 'index']);
        Route::get('/categories', fn () => response()->json(Category::where('active', true)->orderBy('sort_order')->orderBy('id')->get()));
        Route::get('/products/recommended', [ProductController::class, 'recommended']);
        Route::get('/products/{slug}', [ProductController::class, 'show']);
        Route::get('/symptoms', fn () => response()->json(Symptom::where('active', true)->orderBy('name')->get()));
    });

    // Logística (Melhor Envio & Retirada)
    Route::get('/postal-codes/{cep}', PostalCodeController::class)->middleware('throttle:postal-codes');
    Route::post('/shipping/calculate', [ShippingController::class, 'calculate'])->middleware('throttle:shipping');
    Route::post('/payments/mercado-pago/webhook', [MercadoPagoWebhookController::class, 'receive'])
        ->middleware('throttle:mercado-pago-webhook')
        ->name('payments.mercado-pago.webhook');

    // 2. ROTAS AUTENTICADAS DE CLIENTES
    Route::middleware(['auth:sanctum', CheckCustomerRole::class])->group(function () use ($emailVerificationMiddleware) {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::post('/email/confirm-code', [EmailVerificationController::class, 'confirm'])
            ->middleware('throttle:email-code');
        Route::post('/email/verification-notification', [EmailVerificationController::class, 'resend'])
            ->middleware('throttle:email-verification');
        Route::post('/user/profile', [UserProfileController::class, 'storeOrUpdate']);
        Route::get('/user/profile', [UserProfileController::class, 'show']);
        Route::delete('/user/profile', [UserProfileController::class, 'destroy']);
        Route::get('/recommendations', [UserProfileController::class, 'recommendations'])->middleware($emailVerificationMiddleware);
        Route::post('/checkout', [PaymentController::class, 'checkout'])->middleware([...$emailVerificationMiddleware, 'throttle:checkout']);
        Route::post('/checkout/transparent', [PaymentController::class, 'transparent'])->middleware([...$emailVerificationMiddleware, 'throttle:checkout']);
        Route::get('/checkout/attempt/{number}', [PaymentController::class, 'transparentStatus'])->middleware('throttle:api');
        Route::get('/checkout/transparent/{number}', [PaymentController::class, 'transparentStatus'])->middleware('throttle:api');
        Route::get('/orders', [OrderController::class, 'index'])->middleware($emailVerificationMiddleware);
        Route::get('/orders/{orderNumber}', [OrderController::class, 'show'])
            ->where('orderNumber', 'PC-[A-Z0-9]{14}')
            ->middleware($emailVerificationMiddleware);

    });

    // 3. ROTAS DO PAINEL: somente sessão administrativa; não aceita bearer token.
    Route::prefix('admin')->middleware(['auth:admin', CheckAdminRole::class, AuditAdminActions::class, 'throttle:admin'])->group(function () {
        Route::get('/system-status', AdminSystemController::class)->middleware('can:system.view');

        // CRUD & Gestão de Produtos
        Route::get('/products', [AdminController::class, 'indexProducts'])->middleware('can:products.view');
        Route::post('/products', [AdminController::class, 'storeProduct'])->middleware('can:products.create');
        Route::put('/products/{id}', [AdminController::class, 'updateProduct'])->middleware('can:products.update');
        Route::patch('/products/{id}/stock', [AdminController::class, 'updateStock'])->middleware('can:products.stock');
        Route::delete('/products/{id}', [AdminController::class, 'deleteProduct'])->middleware('can:products.delete');

        Route::get('/categories', [AdminController::class, 'indexCategories'])->middleware('can:categories.view');
        Route::post('/categories', [AdminController::class, 'storeCategory'])->middleware('can:categories.create');
        Route::put('/categories/order', [AdminController::class, 'reorderCategories'])->middleware('can:categories.order');
        Route::put('/categories/{id}', [AdminController::class, 'updateCategory'])->middleware('can:categories.update');
        Route::delete('/categories/{id}', [AdminController::class, 'deleteCategory'])->middleware('can:categories.delete');
        Route::post('/categories/{id}/products', [AdminController::class, 'assignProductsToCategory'])->middleware('can:categories.assign');
        Route::delete('/categories/{id}/products/{productId}', [AdminController::class, 'removeProductFromCategory'])->middleware('can:categories.assign');
        Route::put('/categories/{id}/products/order', [AdminController::class, 'reorderCategoryProducts'])->middleware('can:categories.order');

        Route::get('/taxonomy', [AdminController::class, 'taxonomy'])->middleware('can:taxonomy.view');
        Route::post('/ingredients', [AdminController::class, 'storeIngredient'])->middleware('can:taxonomy.manage');
        Route::post('/tags', [AdminController::class, 'storeTag'])->middleware('can:taxonomy.manage');
        Route::put('/tags/{id}', [AdminController::class, 'updateTag'])->middleware('can:taxonomy.manage');
        Route::delete('/tags/{id}', [AdminController::class, 'deleteTag'])->middleware('can:taxonomy.manage');
        Route::post('/symptoms', [AdminController::class, 'storeSymptom'])->middleware('can:taxonomy.manage');
        Route::put('/symptoms/{id}', [AdminController::class, 'updateSymptom'])->middleware('can:taxonomy.manage');
        Route::delete('/symptoms/{id}', [AdminController::class, 'deleteSymptom'])->middleware('can:taxonomy.manage');

        // Métricas de Saúde & Mapeamento de Demandas
        Route::get('/health-metrics', [AdminController::class, 'healthMetrics'])->middleware('can:health.view');
        Route::get('/orders', [OrderController::class, 'adminIndex'])->middleware('can:orders.view');
        Route::patch('/orders/{id}/fulfillment', [OrderController::class, 'updateFulfillment'])->whereNumber('id')->middleware('can:orders.fulfillment.update');
        Route::patch('/orders/{id}/shipment', [OrderController::class, 'markShipped'])->middleware('can:orders.ship');

        // Módulo Andromeda (Gemini AI Insights)
        Route::get('/ai-insights', [GeminiController::class, 'generateInsights'])->middleware('can:insights.generate');
    });
});
