<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Symptom;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\RecommendationService;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Auth\Notifications\VerifyEmail as VerifyEmailNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class SecurityControlsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_routes_require_authentication_and_admin_role(): void
    {
        $this->getJson('/api/v1/admin/categories')->assertUnauthorized();

        $customer = User::create([
            'name' => 'Cliente teste',
            'email' => 'customer@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);

        Sanctum::actingAs($customer);
        $this->getJson('/api/v1/admin/categories')->assertUnauthorized();
    }

    public function test_admin_routes_accept_admin_and_return_security_headers(): void
    {
        $admin = User::create([
            'name' => 'Admin teste',
            'email' => 'admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();

        $this->actingAs($admin, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->withHeader('Origin', 'http://localhost:3000')
            ->getJson('/api/v1/admin/categories')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }

    public function test_admin_session_requires_recent_mfa_confirmation(): void
    {
        $admin = User::create([
            'name' => 'Admin teste',
            'email' => 'expired-admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();

        $this->actingAs($admin, 'admin');
        $this->withHeader('Origin', 'http://localhost:3000');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner'])
            ->getJson('/api/v1/admin/categories')->assertForbidden();
        $this->withAdminSession(['admin_mfa_confirmed_at' => now()->subHours(8)->subSecond()->getTimestamp()])
            ->getJson('/api/v1/admin/categories')->assertForbidden();
        $this->withAdminSession(['admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->getJson('/api/v1/admin/categories')->assertOk();
    }

    public function test_registration_requires_matching_password_confirmation(): void
    {
        foreach ([null, 'another-long-password'] as $confirmation) {
            $this->postJson('/api/v1/register', [
                'name' => 'Pessoa teste',
                'email' => 'confirmation@example.test',
                'password' => 'a-long-test-password',
                'password_confirmation' => $confirmation,
            ])->assertUnprocessable()->assertJsonValidationErrors('password');
        }

        $this->assertDatabaseMissing('users', ['email' => 'confirmation@example.test']);
    }

    public function test_public_registration_rejects_short_passwords(): void
    {
        $this->postJson('/api/v1/register', [
            'name' => 'Pessoa teste',
            'email' => 'new@example.test',
            'password' => 'short',
            'sexo' => 'Outro',
            'problema_principal' => 'Teste',
        ])->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_customer_registration_is_basic_and_sends_email_confirmation(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/register', [
            'name' => 'Pessoa teste',
            'email' => 'new@example.test',
            'password' => 'a-long-test-password',
            'password_confirmation' => 'a-long-test-password',
        ])->assertCreated()
            ->assertJsonPath('email_verification_required', true)
            ->assertJsonPath('user.profile', null);

        $user = User::where('email', 'new@example.test')->firstOrFail();
        $this->assertNull($user->email_verified_at);
        $this->assertDatabaseCount('user_profiles', 0);
        Notification::assertSentTo($user, VerifyEmailNotification::class, function ($notification) use ($user) {
            $url = $notification->toMail($user)->actionUrl;
            $this->assertStringContainsString('/api/v1/email/verify/'.$user->id.'/', $url);
            $this->assertStringContainsString('signature=', $url);

            return true;
        });
    }

    public function test_signed_email_verification_link_verifies_account_and_rejects_tampering(): void
    {
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'verify@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $url = URL::temporarySignedRoute('verification.verify', now()->addMinutes(10), [
            'id' => $user->id,
            'hash' => sha1($user->getEmailForVerification()),
        ]);

        $this->get($url)->assertRedirect(rtrim((string) config('app.frontend_url'), '/').'/?email_verified=success');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->get($url.'&tampered=1')->assertForbidden();
    }

    public function test_unverified_customer_can_resend_verification_email(): void
    {
        Notification::fake();
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'resend@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);

        Sanctum::actingAs($user);
        $this->postJson('/api/v1/email/verification-notification')
            ->assertAccepted();

        Notification::assertSentTo($user, VerifyEmailNotification::class);
    }

    public function test_verified_customer_can_save_optional_profile_after_registration(): void
    {
        $customer = User::create([
            'name' => 'Cliente perfil',
            'email' => 'profile@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $customer->markEmailAsVerified();
        Sanctum::actingAs($customer);

        $this->getJson('/api/v1/user/profile')->assertOk()->assertJsonPath('profile', null);
        $this->postJson('/api/v1/user/profile', [
            'sexo' => 'Prefiro não dizer',
            'problema_principal' => 'Insônia / Sono',
        ])->assertUnprocessable()->assertJsonValidationErrors('health_data_consent');

        $this->postJson('/api/v1/user/profile', [
            'sexo' => 'Prefiro não dizer',
            'data_nascimento' => null,
            'numero_telefone' => null,
            'problema_principal' => 'Insônia / Sono',
            'canal_aquisicao' => 'Outros',
            'health_data_consent' => true,
        ])->assertOk()->assertJsonPath('profile.problema_principal', 'Insônia / Sono');

        $this->assertDatabaseHas('user_profiles', [
            'user_id' => $customer->id,
            'health_data_consent_version' => '2026-10-v1',
        ]);

        $this->deleteJson('/api/v1/user/profile')->assertOk();
        $this->assertDatabaseMissing('user_profiles', ['user_id' => $customer->id]);
    }

    public function test_login_uses_generic_errors_and_does_not_return_a_bearer_token(): void
    {
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'known@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);

        $known = $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);
        $unknown = $this->postJson('/api/v1/login', [
            'email' => 'missing@example.test',
            'password' => 'wrong-password',
        ]);

        $known->assertUnprocessable()->assertExactJson($unknown->json());
        $known->assertJsonMissingPath('token');
    }

    public function test_successful_spa_login_uses_a_server_session(): void
    {
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'session@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);

        $response = $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'a-long-test-password',
        ]);

        $response->assertOk()->assertJsonMissingPath('token');
        $this->assertAuthenticatedAs($user, 'web');
    }

    public function test_existing_admin_must_reset_password_before_totp_login(): void
    {
        $admin = User::create([
            'name' => 'Admin legado',
            'email' => 'legacy-admin@example.test',
            'password' => 'legacy-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $admin->forceFill(['password_reset_required' => true])->save();

        $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/auth/login', [
            'email' => $admin->email,
            'password' => 'legacy-password',
        ])->assertOk()->assertJsonPath('requires_password_reset', true);
        $this->assertGuest('web');

        $token = Password::createToken($admin);
        $this->postJson('/api/v1/password/reset', [
            'token' => $token,
            'email' => $admin->email,
            'password' => 'new-admin-password-2026',
            'password_confirmation' => 'new-admin-password-2026',
        ])->assertOk();

        $admin->refresh();
        $this->assertFalse($admin->password_reset_required);
        $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/auth/login', [
            'email' => $admin->email,
            'password' => 'new-admin-password-2026',
        ])->assertOk()->assertJsonPath('requires_two_factor_setup', true);
    }

    public function test_login_is_rate_limited(): void
    {
        RateLimiter::clear('login');
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/login', [
                'email' => 'limited@example.test',
                'password' => 'incorrect-password',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/v1/login', [
            'email' => 'limited@example.test',
            'password' => 'incorrect-password',
        ])->assertTooManyRequests();
    }

    public function test_cors_allows_the_csrf_header_for_the_configured_spa(): void
    {
        $response = $this->withHeaders([
            'Origin' => 'http://localhost:3000',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'content-type,x-xsrf-token',
        ])->options('/api/v1/login');

        $response->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
        $this->assertStringContainsString('x-xsrf-token', strtolower($response->headers->get('Access-Control-Allow-Headers', '')));
    }

    public function test_admin_must_enroll_and_verify_totp_before_accessing_admin_routes(): void
    {
        $admin = User::create([
            'name' => 'Admin teste',
            'email' => 'mfa@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $origin = 'http://localhost:3000';

        $login = $this->withHeader('Origin', $origin)->postJson('/api/v1/admin/auth/login', [
            'email' => $admin->email,
            'password' => 'a-long-test-password',
        ])->assertOk()->assertJsonPath('requires_two_factor_setup', true);

        $secret = $login->json('secret');
        $google2fa = app(Google2FA::class);
        $this->withHeader('Origin', $origin)->postJson('/api/v1/admin/auth/two-factor/confirm-setup', [
            'code' => $google2fa->getCurrentOtp($secret),
        ])->assertOk()->assertJsonCount(8, 'recovery_codes');

        $this->assertAuthenticatedAs($admin, 'admin');
        $this->withHeader('Origin', $origin)->getJson('/api/v1/admin/categories')->assertOk();
    }

    public function test_enrolled_admin_cannot_bypass_mfa_with_password_only(): void
    {
        $admin = User::create([
            'name' => 'Admin teste',
            'email' => 'mfa-existing@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $admin->forceFill([
            'two_factor_secret' => app(Google2FA::class)->generateSecretKey(),
            'two_factor_confirmed_at' => now(),
        ])->save();

        $login = $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/auth/login', [
            'email' => $admin->email,
            'password' => 'a-long-test-password',
        ])->assertOk()->assertJsonPath('requires_two_factor', true);
        $this->assertArrayNotHasKey('user', $login->json());
        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/categories')
            ->assertUnauthorized();

        $google2fa = app(Google2FA::class);
        $code = $google2fa->getCurrentOtp($admin->two_factor_secret);
        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/auth/two-factor/verify', ['code' => $code])
            ->assertOk();
        $this->withHeader('Origin', 'http://localhost:3000')
            ->getJson('/api/v1/admin/categories')
            ->assertOk();

        $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/admin/auth/login', [
            'email' => $admin->email,
            'password' => 'a-long-test-password',
        ])->assertJsonPath('requires_two_factor', true);
        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/auth/two-factor/verify', ['code' => $code])
            ->assertUnprocessable();
    }

    public function test_checkout_requires_verified_email_and_never_creates_a_fake_order(): void
    {
        $customer = User::create([
            'name' => 'Cliente teste',
            'email' => 'buyer@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);

        Sanctum::actingAs($customer);
        $this->postJson('/api/v1/checkout', [])->assertForbidden();
        $customer->markEmailAsVerified();
        $this->postJson('/api/v1/checkout', [])->assertUnprocessable();
        $this->postJson('/api/v1/checkout', [
            'idempotency_key' => (string) Str::uuid(),
            'items' => [['product_id' => 1, 'quantity' => 1]],
            'postal_code' => '66000-000',
            'shipping_option_id' => 1,
            'expected_subtotal' => '10.00',
            'expected_shipping_price' => '15.00',
            'shipping_address' => [
                'recipient_name' => 'Pessoa Teste',
                'phone' => '91999990000',
                'street' => 'Rua Teste',
                'number' => '10',
                'neighborhood' => 'Centro',
                'city' => 'Belém',
                'state' => 'PA',
            ],
        ])->assertStatus(503);
        $this->assertDatabaseCount('orders', 0);
        $this->postJson('/api/v1/payments/mercado-pago/webhook?type=payment&data_id=12345', [
            'type' => 'payment',
            'data' => ['id' => '12345'],
        ])->assertUnauthorized();
    }

    public function test_checkout_creates_a_server_priced_order_and_reuses_idempotency_key(): void
    {
        config([
            'services.melhor_envio.token' => 'test-shipping-token',
            'services.melhor_envio.origin_cep' => '66000-000',
            'services.melhor_envio.environment' => 'sandbox',
            'services.melhor_envio.user_agent' => 'Pruma Essential (dev@example.test)',
            'services.mercado_pago.access_token' => 'test-mp-token',
            'services.mercado_pago.webhook_secret' => 'test-webhook-secret',
            'services.mercado_pago.environment' => 'sandbox',
            'services.mercado_pago.webhook_url' => 'https://api.store.test/api/v1/payments/mercado-pago/webhook',
            'app.url' => 'https://api.store.test',
            'app.frontend_url' => 'https://store.test',
        ]);
        Http::fake([
            'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate' => Http::response([[
                'id' => 1,
                'name' => 'PAC',
                'custom_price' => '18.50',
                'custom_delivery_time' => 4,
                'company' => ['name' => 'Correios'],
            ]]),
            'https://api.mercadopago.com/checkout/preferences' => Http::response([
                'id' => '123456-9b2a',
                'init_point' => 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123456',
                'sandbox_init_point' => 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=123456',
            ]),
        ]);

        $customer = User::create([
            'name' => 'Cliente pagamento',
            'email' => 'checkout@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $customer->markEmailAsVerified();
        $product = Product::create([
            'name' => 'Blend Checkout',
            'slug' => 'blend-checkout',
            'price' => 29.90,
            'stock' => 3,
            'is_active' => true,
            'shipping_width_cm' => 8,
            'shipping_height_cm' => 10,
            'shipping_length_cm' => 12,
            'shipping_weight_kg' => 0.12,
        ]);
        Sanctum::actingAs($customer);
        $payload = $this->checkoutPayload($product, '550e8400-e29b-41d4-a716-446655440001');

        $this->postJson('/api/v1/checkout', $payload)
            ->assertCreated()
            ->assertJsonPath('checkout_url', 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=123456');

        $order = Order::query()->with('items')->firstOrFail();
        $this->assertSame('pending', $order->status);
        $this->assertSame('123456-9b2a', $order->payment_preference_id);
        $this->assertSame('48.40', $order->total_price);
        $this->assertTrue($order->stock_reserved);
        $this->assertSame(2, $product->fresh()->stock);
        $this->assertSame('Rua Teste', $order->shipping_address['street']);
        $storedOrder = DB::table('orders')->where('id', $order->id)->first();
        $this->assertStringNotContainsString('Rua Teste', $storedOrder->shipping_address);

        $this->postJson('/api/v1/checkout', $payload)
            ->assertOk()
            ->assertJsonPath('order_number', $order->order_number);
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(2, $product->fresh()->stock);
        $preferenceRequests = Http::recorded()->filter(fn (array $recorded) => $recorded[0]->url() === 'https://api.mercadopago.com/checkout/preferences');
        $this->assertCount(1, $preferenceRequests);

        $preferenceRequest = $preferenceRequests->first()[0];
        $this->assertSame($order->order_number, $preferenceRequest['external_reference']);
        $this->assertTrue($preferenceRequest->hasHeader('Authorization', 'Bearer test-mp-token'));
        $this->assertSame('https://api.store.test/api/v1/payments/mercado-pago/webhook', $preferenceRequest['notification_url']);
    }

    public function test_checkout_rejects_tampered_client_amount_before_reserving_stock(): void
    {
        config([
            'services.melhor_envio.token' => 'test-shipping-token',
            'services.melhor_envio.origin_cep' => '66000-000',
            'services.melhor_envio.environment' => 'sandbox',
            'services.melhor_envio.user_agent' => 'Pruma Essential (dev@example.test)',
            'services.mercado_pago.access_token' => 'test-mp-token',
            'services.mercado_pago.webhook_secret' => 'test-webhook-secret',
            'services.mercado_pago.environment' => 'sandbox',
        ]);
        Http::fake([
            'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate' => Http::response([[
                'id' => 1,
                'name' => 'PAC',
                'custom_price' => '18.50',
                'custom_delivery_time' => 4,
                'company' => ['name' => 'Correios'],
            ]]),
        ]);
        $customer = User::create([
            'name' => 'Cliente preço',
            'email' => 'price-check@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $customer->markEmailAsVerified();
        $product = Product::create([
            'name' => 'Blend Preço',
            'slug' => 'blend-preco',
            'price' => 29.90,
            'stock' => 2,
            'is_active' => true,
            'shipping_width_cm' => 8,
            'shipping_height_cm' => 10,
            'shipping_length_cm' => 12,
            'shipping_weight_kg' => 0.12,
        ]);
        Sanctum::actingAs($customer);
        $payload = $this->checkoutPayload($product, '550e8400-e29b-41d4-a716-446655440002');
        $payload['expected_subtotal'] = '1.00';

        $this->postJson('/api/v1/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('items');
        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(2, $product->fresh()->stock);
        Http::assertNotSent(fn (ClientRequest $request) => $request->url() === 'https://api.mercadopago.com/checkout/preferences');
    }

    public function test_signed_mercado_pago_webhook_marks_paid_only_after_server_verification_and_is_idempotent(): void
    {
        config([
            'services.mercado_pago.access_token' => 'test-mp-token',
            'services.mercado_pago.webhook_secret' => 'test-webhook-secret',
        ]);
        Http::fake([
            'https://api.mercadopago.com/v1/payments/12345' => Http::response([
                'id' => 12345,
                'status' => 'approved',
                'external_reference' => 'PC-ABCD1234EFGH56',
                'transaction_amount' => 48.40,
                'currency_id' => 'BRL',
                'preference_id' => 'preference-123',
                'payment_method_id' => 'pix',
                'payment_type_id' => 'bank_transfer',
            ]),
        ]);

        $customer = User::create([
            'name' => 'Cliente webhook',
            'email' => 'webhook@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $product = Product::create([
            'name' => 'Blend webhook',
            'slug' => 'blend-webhook',
            'price' => 29.90,
            'stock' => 2,
            'is_active' => true,
        ]);
        $order = Order::create([
            'user_id' => $customer->id,
            'order_number' => 'PC-ABCD1234EFGH56',
            'total_price' => 48.40,
            'status' => 'pending',
            'payment_method' => null,
            'payment_status' => 'pending',
            'payment_preference_id' => 'preference-123',
            'stock_reserved' => true,
            'payment_expires_at' => now()->addHours(24),
            'shipping_method' => 'Correios PAC',
            'shipping_cost' => 18.50,
            'shipping_address' => ['street' => 'Rua Teste'],
        ]);
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => 'Blend webhook',
            'unit_price' => 29.90,
            'quantity' => 1,
            'subtotal' => 29.90,
        ]);
        $product->decrement('stock');

        $requestId = 'test-request-1';
        $timestamp = (string) now()->timestamp;
        $manifest = 'id:12345;request-id:'.$requestId.';ts:'.$timestamp.';';
        $signature = 'ts='.$timestamp.',v1='.hash_hmac('sha256', $manifest, 'test-webhook-secret');
        $url = '/api/v1/payments/mercado-pago/webhook?type=payment&data_id=12345';
        $payload = ['id' => 'webhook-event-1', 'type' => 'payment', 'data' => ['id' => '12345']];

        $this->withHeaders(['x-request-id' => $requestId, 'x-signature' => $signature])
            ->postJson($url, $payload)
            ->assertOk();

        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame('approved', $order->fresh()->payment_status);
        $this->assertSame('pix', $order->fresh()->payment_method);
        $this->assertSame(1, $product->fresh()->stock);
        $this->assertDatabaseCount('payment_webhook_events', 1);

        $this->withHeaders(['x-request-id' => $requestId, 'x-signature' => $signature])
            ->postJson($url, $payload)
            ->assertOk();

        $this->assertSame(1, $product->fresh()->stock);
        $this->assertDatabaseCount('payment_webhook_events', 1);
    }

    public function test_customer_can_only_read_own_orders_and_admin_can_add_tracking_to_paid_orders(): void
    {
        $customer = User::create([
            'name' => 'Cliente pedido',
            'email' => 'order-owner@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $otherCustomer = User::create([
            'name' => 'Outro cliente',
            'email' => 'other-order-owner@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $customer->forceFill(['email_verified_at' => now()])->save();
        $otherCustomer->forceFill(['email_verified_at' => now()])->save();
        $order = Order::create([
            'user_id' => $customer->id,
            'order_number' => 'PC-ORDER123456789',
            'total_price' => 42.90,
            'status' => 'paid',
            'payment_method' => 'pix',
            'shipping_method' => 'Correios PAC',
            'shipping_cost' => 13,
            'shipping_address' => ['street' => 'Rua privada'],
        ]);

        Sanctum::actingAs($otherCustomer);
        $this->getJson('/api/v1/orders/PC-ORDER123456789')->assertNotFound();
        Sanctum::actingAs($customer);
        $this->getJson('/api/v1/orders/PC-ORDER123456789')
            ->assertOk()
            ->assertJsonPath('data.order_number', 'PC-ORDER123456789')
            ->assertJsonPath('data.shipping_address.street', 'Rua privada');

        $admin = User::create([
            'name' => 'Admin pedidos',
            'email' => 'orders-admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $this->actingAs($admin, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->withHeader('Origin', 'http://localhost:3000')
            ->patchJson('/api/v1/admin/orders/'.$order->id.'/shipment', ['tracking_code' => 'BR123456789'])
            ->assertOk();
        $this->assertSame('shipped', $order->fresh()->status);
        $this->assertSame('BR123456789', $order->fresh()->tracking_code);
    }

    public function test_shipping_quote_uses_server_product_and_package_data(): void
    {
        config([
            'services.melhor_envio.token' => 'test-token',
            'services.melhor_envio.origin_cep' => '66000-000',
            'services.melhor_envio.environment' => 'sandbox',
            'services.melhor_envio.user_agent' => 'Pruma Essential (dev@example.test)',
        ]);
        Http::fake([
            'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate' => Http::response([[
                'id' => 1,
                'name' => 'PAC',
                'custom_price' => '18.50',
                'custom_delivery_time' => 4,
                'company' => ['name' => 'Correios'],
            ]]),
        ]);
        $product = Product::create([
            'name' => 'Blend teste',
            'slug' => 'blend-teste',
            'price' => 29.90,
            'stock' => 4,
            'is_active' => true,
            'shipping_width_cm' => 8,
            'shipping_height_cm' => 10,
            'shipping_length_cm' => 12,
            'shipping_weight_kg' => 0.12,
        ]);

        $this->postJson('/api/v1/shipping/calculate', [
            'postal_code' => '01001-000',
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
            'price' => 0.01,
        ])->assertOk()
            ->assertJsonPath('data.0.price', 18.5)
            ->assertJsonPath('data.0.delivery_time', 4);

        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate'
            && $request->hasHeader('Authorization', 'Bearer test-token')
            && $request['to']['postal_code'] === '01001000'
            && $request['products'][0]['insurance_value'] === 29.9
            && $request['products'][0]['quantity'] === 2);
    }

    public function test_sensitive_profile_fields_are_encrypted_at_rest(): void
    {
        $user = User::create([
            'name' => 'Cliente privacidade',
            'email' => 'privacy@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);

        $profile = UserProfile::create([
            'user_id' => $user->id,
            'sexo' => 'Outro',
            'data_nascimento' => '1991-02-03',
            'numero_telefone' => '+55 91 99999-0000',
            'problema_principal' => 'Queixa privada de teste',
            'canal_aquisicao' => 'Instagram',
        ]);

        $stored = DB::table('user_profiles')->where('id', $profile->id)->first();

        $this->assertNotSame('Outro', $stored->sexo);
        $this->assertNotSame('1991-02-03', $stored->data_nascimento);
        $this->assertNotSame('+55 91 99999-0000', $stored->numero_telefone);
        $this->assertNotSame('Queixa privada de teste', $stored->problema_principal);
        $this->assertNotSame('Instagram', $stored->canal_aquisicao);
        $this->assertSame('Outro', $profile->fresh()->sexo);
        $this->assertSame('1991-02-03', $profile->fresh()->data_nascimento);
        $this->assertSame('+55 91 99999-0000', $profile->fresh()->numero_telefone);
        $this->assertSame('Queixa privada de teste', $profile->fresh()->problema_principal);
        $this->assertSame('Instagram', $profile->fresh()->canal_aquisicao);
    }

    public function test_renaming_a_symptom_updates_encrypted_customer_profiles(): void
    {
        $admin = User::create([
            'name' => 'Admin sintomas',
            'email' => 'symptom-admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $customer = User::create([
            'name' => 'Cliente sintoma',
            'email' => 'symptom-customer@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $symptom = Symptom::where('name', 'Insônia / Sono')->firstOrFail();
        $profile = UserProfile::create([
            'user_id' => $customer->id,
            'sexo' => 'Outro',
            'problema_principal' => $symptom->name,
            'health_data_consented_at' => now(),
            'health_data_consent_version' => '2026-10-v1',
        ]);
        $legacyCustomer = User::create([
            'name' => 'Cliente sem consentimento',
            'email' => 'legacy-symptom-customer@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        $legacyProfile = UserProfile::create([
            'user_id' => $legacyCustomer->id,
            'sexo' => 'Outro',
            'problema_principal' => $symptom->name,
        ]);

        $this->actingAs($admin, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->withHeader('Origin', 'http://localhost:3000')
            ->putJson('/api/v1/admin/symptoms/'.$symptom->id, ['name' => 'Sono restaurador'])
            ->assertOk();

        $this->assertSame('Sono restaurador', $profile->fresh()->problema_principal);
        $this->assertSame('Insônia / Sono', $legacyProfile->fresh()->problema_principal);
    }

    public function test_ai_insights_only_send_aggregated_allowed_labels(): void
    {
        config([
            'services.gemini.key' => 'test-only-key',
            'services.gemini.model' => 'gemini-test',
        ]);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [['text' => '{"marketing_content_ideas":[]}']]],
                ]],
            ]),
        ]);

        $admin = User::create([
            'name' => 'Admin IA',
            'email' => 'ai-admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();

        foreach (range(1, 5) as $index) {
            $user = User::create([
                'name' => "Cliente IA {$index}",
                'email' => "ai-{$index}@example.test",
                'password' => 'a-long-test-password',
                'role' => 'customer',
            ]);
            UserProfile::create([
                'user_id' => $user->id,
                'sexo' => 'Outro',
                'problema_principal' => 'Ansiedade / Estresse',
                'health_data_consented_at' => now(),
                'health_data_consent_version' => '2026-10-v1',
            ]);
        }

        foreach (range(1, 4) as $index) {
            $user = User::create([
                'name' => "Cliente privado {$index}",
                'email' => "private-{$index}@example.test",
                'password' => 'a-long-test-password',
                'role' => 'customer',
            ]);
            UserProfile::create([
                'user_id' => $user->id,
                'sexo' => 'Outro',
                'problema_principal' => "Queixa privada {$index}",
            ]);
        }

        $this->actingAs($admin, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->withHeader('Origin', 'http://localhost:3000')
            ->getJson('/api/v1/admin/ai-insights')
            ->assertOk()
            ->assertJsonPath('minimum_group_size', 5)
            ->assertJsonPath('total_profiles_analyzed', 5);

        $sentPayload = json_decode(Http::recorded()->first()[0]->body(), true, flags: JSON_THROW_ON_ERROR);
        $prompt = str_replace('\\/', '/', $sentPayload['contents'][0]['parts'][0]['text']);
        $this->assertStringContainsString('{"complaint":"Ansiedade / Estresse","count":5}', $prompt);
        $this->assertStringNotContainsString('Queixa privada', $prompt);
        $this->assertStringNotContainsString('private-1@example.test', $prompt);
    }

    public function test_admin_health_reports_hide_small_free_text_groups(): void
    {
        $admin = User::create([
            'name' => 'Admin analytics',
            'email' => 'analytics-admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();

        foreach (range(1, 3) as $index) {
            $user = User::create([
                'name' => "Cliente {$index}",
                'email' => "health-{$index}@example.test",
                'password' => 'a-long-test-password',
                'role' => 'customer',
            ]);
            UserProfile::create([
                'user_id' => $user->id,
                'sexo' => 'Outro',
                'problema_principal' => "Queixa particular {$index}",
                'health_data_consented_at' => now(),
                'health_data_consent_version' => '2026-10-v1',
            ]);
        }

        $this->actingAs($admin, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->withHeader('Origin', 'http://localhost:3000')
            ->getJson('/api/v1/admin/health-metrics')
            ->assertOk()
            ->assertJsonPath('total_clients_analyzed', 3)
            ->assertJsonCount(0, 'symptoms_distribution')
            ->assertJsonMissing(['problema' => 'Queixa particular 1']);
    }

    public function test_legacy_profile_without_consent_is_not_used_for_personalized_recommendations(): void
    {
        $customer = User::create([
            'name' => 'Cliente legado',
            'email' => 'legacy-recommendation@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        UserProfile::create([
            'user_id' => $customer->id,
            'sexo' => 'Outro',
            'problema_principal' => 'Ansiedade / Estresse',
        ]);

        $targetedProduct = Product::create([
            'name' => 'Blend do perfil antigo',
            'slug' => 'blend-perfil-antigo',
            'price' => 29.90,
            'stock' => 5,
            'symptom_target' => 'Ansiedade / Estresse',
            'is_active' => true,
        ]);
        $popularProduct = Product::create([
            'name' => 'Blend mais vendido',
            'slug' => 'blend-mais-vendido',
            'price' => 29.90,
            'stock' => 5,
            'sales_count' => 50,
            'is_active' => true,
        ]);

        $recommendations = app(RecommendationService::class)->getRecommendationsForUser($customer);

        $this->assertSame($popularProduct->id, $recommendations->first()->id);
        $this->assertNotSame($targetedProduct->id, $recommendations->first()->id);

        Sanctum::actingAs($customer);
        $this->getJson('/api/v1/products/recommended?symptom=Ansiedade')
            ->assertOk()
            ->assertJsonPath('symptom_target', null);
    }

    public function test_successful_admin_mutations_are_audited_without_request_payloads(): void
    {
        $admin = User::create([
            'name' => 'Admin auditoria',
            'email' => 'audit-admin@example.test',
            'password' => 'a-long-test-password',
            'role' => 'admin',
        ]);
        $admin->forceFill(['admin_profile' => 'owner'])->save();

        $this->actingAs($admin, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_confirmed_at' => now()->getTimestamp()])
            ->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/symptoms', ['name' => 'Nova queixa de teste'])
            ->assertCreated();

        $this->assertDatabaseHas('security_audit_logs', [
            'admin_user_id' => $admin->id,
            'method' => 'POST',
            'route' => 'api/v1/admin/symptoms',
            'status_code' => 201,
        ]);
        $this->assertDatabaseMissing('security_audit_logs', ['action' => 'Nova queixa de teste']);
    }

    public function test_product_search_rejects_unbounded_query_values(): void
    {
        $this->getJson('/api/v1/products?search='.str_repeat('a', 121))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('search');
    }

    public function test_forgot_password_response_does_not_disclose_account_existence(): void
    {
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'registered@example.test',
            'password' => Hash::make('a-long-test-password'),
            'role' => 'customer',
        ]);

        $existing = $this->postJson('/api/v1/password/forgot', ['email' => 'registered@example.test']);
        $missing = $this->postJson('/api/v1/password/forgot', ['email' => 'missing@example.test']);

        $existing->assertAccepted()->assertExactJson($missing->json());
    }

    public function test_password_reset_url_keeps_token_in_fragment(): void
    {
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'reset-link@example.test',
            'password' => 'a-long-test-password',
            'role' => 'customer',
        ]);
        Notification::fake();

        $this->postJson('/api/v1/password/forgot', ['email' => $user->email])->assertAccepted();

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $url = $notification->toMail($user)->actionUrl;
            $this->assertStringContainsString('/reset-password#', $url);
            $this->assertStringNotContainsString('token=', parse_url($url, PHP_URL_QUERY) ?? '');
            parse_str(parse_url($url, PHP_URL_FRAGMENT) ?? '', $fragment);
            $this->assertNotEmpty($fragment['token'] ?? null);
            $this->assertSame($user->email, $fragment['email'] ?? null);

            return true;
        });
    }

    public function test_password_reset_revokes_personal_tokens_and_is_one_time(): void
    {
        $user = User::create([
            'name' => 'Cliente teste',
            'email' => 'reset@example.test',
            'password' => 'old-test-password',
            'role' => 'customer',
        ]);
        $token = $user->createToken('test-client')->plainTextToken;
        $resetToken = Password::createToken($user);

        DB::table('sessions')->insert([
            'id' => 'session-to-revoke',
            'user_id' => $user->id,
            'payload' => 'test-session',
            'last_activity' => time(),
        ]);

        $payload = [
            'token' => $resetToken,
            'email' => $user->email,
            'password' => 'new-test-password-2026',
            'password_confirmation' => 'new-test-password-2026',
        ];
        $this->postJson('/api/v1/password/reset', $payload)->assertOk();

        $user->refresh();
        $this->assertTrue(Hash::check('new-test-password-2026', $user->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseMissing('sessions', ['id' => 'session-to-revoke']);
        $this->postJson('/api/v1/password/reset', $payload)->assertUnprocessable();
    }

    private function checkoutPayload(Product $product, string $idempotencyKey): array
    {
        return [
            'idempotency_key' => $idempotencyKey,
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
            'postal_code' => '66000-000',
            'shipping_option_id' => 1,
            'expected_subtotal' => number_format((float) $product->price, 2, '.', ''),
            'expected_shipping_price' => '18.50',
            'shipping_address' => [
                'recipient_name' => 'Pessoa Teste',
                'phone' => '91999990000',
                'street' => 'Rua Teste',
                'number' => '10',
                'complement' => 'Sala 2',
                'neighborhood' => 'Centro',
                'city' => 'Belém',
                'state' => 'PA',
            ],
        ];
    }
}
