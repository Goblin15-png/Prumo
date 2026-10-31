<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\MercadoPagoOrdersService;
use App\Services\ShippingQuoteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransparentCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.mercado_pago.access_token' => 'test-token', 'services.mercado_pago.public_key' => 'TEST-public-key',
            'services.mercado_pago.webhook_secret' => 'test-webhook', 'services.pickup.enabled' => true,
            'services.pickup.instructions' => 'Local fictício de retirada para testes.',
        ]);
        Http::preventStrayRequests();
        $this->customer = User::create(['name' => 'Cliente Teste', 'email' => 'orders@example.invalid', 'password' => 'test-password-long', 'role' => 'customer']);
        $this->customer->markEmailAsVerified();
        Sanctum::actingAs($this->customer);
        $this->product = Product::create(['name' => 'Blend teste', 'slug' => 'blend-orders-test', 'price' => 50, 'stock' => 5, 'is_active' => true]);
    }

    private function payload(string $method = 'pix'): array
    {
        return [
            'idempotency_key' => (string) Str::uuid(), 'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
            'fulfillment_method' => 'pickup', 'pickup_contact_name' => 'Pessoa Fictícia',
            'expected_subtotal' => '50.00', 'expected_shipping_price' => '0.00',
            'payment' => ['type' => $method, 'identification' => ['type' => 'CPF', 'number' => '12345678909'],
                ...($method === 'credit_card' ? ['id' => 'master', 'token' => 'test-card-token-123456', 'installments' => 1] : [])],
        ];
    }

    private function snapshot(Order $order, string $status = 'action_required', int $version = 1): array
    {
        return ['id' => 'ORD01TEST1234567890', 'type' => 'online', 'external_reference' => $order->order_number,
            'total_amount' => (string) $order->total_price, 'currency_id' => 'BRL', 'country_code' => 'BRA',
            'status' => $status, 'status_detail' => $status === 'processed' ? 'accredited' : $status, 'version' => $version,
            'transactions' => ['payments' => [['id' => 'PAY01TEST1234567890', 'amount' => (string) $order->total_price,
                'status' => $status, 'status_detail' => $status === 'processed' ? 'accredited' : $status,
                'payment_method' => ['id' => 'pix', 'type' => 'bank_transfer', 'qr_code' => 'pix-ficticio-teste']]]]];
    }

    private function fakeCreate(string $status = 'action_required'): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(fn ($request) => Http::response($this->snapshot(Order::firstOrFail(), $status)));
    }

    public function test_pix_is_created_on_site_with_server_total_and_pickup_encrypted(): void
    {
        $this->fakeCreate();
        $payload = $this->payload();
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk()->assertJsonPath('status', 'pending')->assertJsonPath('pix_qr_code', 'pix-ficticio-teste')->assertJsonMissingPath('checkout_url');
        $order = Order::firstOrFail();
        $this->assertSame('pickup', $order->fulfillment_method);
        $this->assertSame('Pessoa Fictícia', $order->pickup_contact_name);
        $this->assertNotSame('Pessoa Fictícia', $order->getRawOriginal('pickup_contact_name'));
        $this->assertNull($order->shipping_address);
        $this->assertSame('0.00', $order->shipping_cost);
        $this->assertSame(4, $this->product->fresh()->stock);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.mercadopago.com/v1/orders'
            && $request->hasHeader('X-Idempotency-Key', $payload['idempotency_key']) && $request['total_amount'] === '50.00'
            && data_get($request->data(), 'transactions.payments.0.payment_method.type') === 'bank_transfer');
        $this->getJson('/api/v1/orders')->assertJsonCount(0, 'data');
        $this->assertNull($order->payment_preference_id);
    }

    public function test_card_token_is_transient_and_processed_response_confirms_payment(): void
    {
        $this->fakeCreate('processed');
        $payload = $this->payload('credit_card');
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk()->assertJsonPath('status', 'paid');
        $order = Order::firstOrFail();
        $this->assertStringNotContainsString($payload['payment']['token'], json_encode($order->getRawOriginal()));
        Http::assertSent(fn ($request) => data_get($request->data(), 'transactions.payments.0.payment_method.token') === $payload['payment']['token']);
        $this->assertSame(4, $this->product->fresh()->stock);
        $this->getJson('/api/v1/orders')->assertJsonPath('data.0.pickup_contact_name', 'Pessoa Fictícia');
    }

    public function test_repeated_payload_reuses_provider_order_and_changed_payload_is_rejected(): void
    {
        $this->fakeCreate();
        $payload = $this->payload();
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk();
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk();
        Http::assertSentCount(2); // one POST then one GET; no repeated creation
        $changed = $payload;
        $changed['pickup_contact_name'] = 'Outra pessoa';
        $this->postJson('/api/v1/checkout/transparent', $changed)->assertStatus(409);
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(4, $this->product->fresh()->stock);
    }

    public function test_timeout_retains_reservation_and_same_provider_idempotency_key_on_retry(): void
    {
        Http::fake(fn () => throw new ConnectionException('Timeout fictício'));
        $payload = $this->payload();
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertStatus(503);
        $order = Order::firstOrFail();
        $this->assertTrue($order->stock_reserved);
        $this->assertSame('pending', $order->status);
        $this->assertSame(4, $this->product->fresh()->stock);
        $this->fakeCreate('processed');
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk()->assertJsonPath('status', 'paid');
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(4, $this->product->fresh()->stock);
    }

    public function test_rejected_payment_restores_stock_once_and_stale_snapshot_cannot_downgrade_paid(): void
    {
        $this->fakeCreate('failed');
        $this->postJson('/api/v1/checkout/transparent', $this->payload())->assertOk()->assertJsonPath('status', 'cancelled');
        $order = Order::firstOrFail();
        $service = app(MercadoPagoOrdersService::class);
        $service->apply($order, $this->snapshot($order, 'failed', 2));
        $this->assertSame(5, $this->product->fresh()->stock);
        $service->apply($order->fresh(), $this->snapshot($order, 'processed', 3));
        $service->apply($order->fresh(), $this->snapshot($order, 'action_required', 1));
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(4, $this->product->fresh()->stock);
        $service->apply($order->fresh(), $this->snapshot($order, 'refunded', 4));
        $service->apply($order->fresh(), $this->snapshot($order, 'processed', 3));
        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertSame(5, $this->product->fresh()->stock);
    }

    public function test_signed_order_webhook_confirms_using_get_and_repeated_notification_is_idempotent(): void
    {
        $this->fakeCreate();
        $this->postJson('/api/v1/checkout/transparent', $this->payload())->assertOk();
        $order = Order::firstOrFail();
        $snapshot = $this->snapshot($order, 'processed', 2);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(fn () => Http::response($snapshot));
        $id = $snapshot['id'];
        $requestId = 'test-request';
        $timestamp = (string) now()->timestamp;
        $hash = hash_hmac('sha256', 'id:'.strtolower($id).';request-id:'.$requestId.';ts:'.$timestamp.';', 'test-webhook');
        $path = '/api/v1/payments/mercado-pago/webhook?type=order&data_id='.$id;
        $this->postJson($path, ['type' => 'order', 'data' => ['id' => $id]])->assertUnauthorized();
        for ($i = 0; $i < 2; $i++) {
            $this->withHeaders(['x-request-id' => $requestId, 'x-signature' => 'ts='.$timestamp.',v1='.$hash])->postJson($path, ['type' => 'order', 'data' => ['id' => $id, 'status' => 'failed']])->assertOk();
        }
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(4, $this->product->fresh()->stock);
    }

    public function test_client_cannot_spoof_totals_pickup_or_sensitive_card_fields(): void
    {
        $payload = $this->payload();
        $payload['expected_subtotal'] = '1.00';
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertUnprocessable();
        $payload = $this->payload();
        $payload['payment']['card_number'] = '4111111111111111';
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertUnprocessable();
        config(['services.pickup.enabled' => false]);
        $this->postJson('/api/v1/checkout/transparent', $this->payload())->assertUnprocessable();
        $this->assertDatabaseCount('orders', 0);
        Http::assertNothingSent();
    }

    public function test_recovery_is_private_and_local_expiration_does_not_release_unknown_charge(): void
    {
        $this->fakeCreate();
        $payload = $this->payload();
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk();
        $this->getJson('/api/v1/checkout/attempt/'.$payload['idempotency_key'])->assertOk()->assertJsonPath('status', 'pending');
        $order = Order::firstOrFail();
        $order->forceFill(['mercado_pago_order_id' => null, 'payment_expires_at' => now()->subDay()])->save();
        $this->artisan('orders:expire-pending')->assertSuccessful();
        $this->assertTrue($order->fresh()->stock_reserved);
        $other = User::create(['name' => 'Outra pessoa', 'email' => 'other@example.invalid', 'password' => 'test-password-long', 'role' => 'customer']);
        Sanctum::actingAs($other);
        $this->getJson('/api/v1/checkout/attempt/'.$payload['idempotency_key'])->assertNotFound();
    }

    public function test_delivery_uses_server_shipping_and_never_accepts_a_free_delivery_flag(): void
    {
        $this->mock(ShippingQuoteService::class, function ($mock) {
            $mock->shouldReceive('calculate')->andReturn(collect([['id' => 1, 'company' => 'Teste', 'name' => 'Entrega', 'price' => 12.90]]));
        });
        $payload = $this->payload();
        unset($payload['pickup_contact_name']);
        $payload += ['postal_code' => '00000-000', 'shipping_option_id' => 1, 'shipping_address' => ['recipient_name' => 'Pessoa Fictícia', 'phone' => '00000000000', 'street' => 'Rua Fictícia', 'number' => '10', 'neighborhood' => 'Bairro Modelo', 'city' => 'Cidade Fictícia', 'state' => 'PA']];
        $payload['fulfillment_method'] = 'delivery';
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertUnprocessable();
        $payload['expected_shipping_price'] = '12.90';
        $this->fakeCreate();
        $this->postJson('/api/v1/checkout/transparent', $payload)->assertOk()->assertJsonPath('total_price', '62.90');
        $this->assertSame('delivery', Order::firstOrFail()->fulfillment_method);
        $this->assertSame('00000000', Order::firstOrFail()->shipping_address['postal_code']);
        $this->assertNull(Order::firstOrFail()->pickup_contact_name);
    }

    public function test_provider_mismatched_amount_cannot_confirm_and_does_not_release_stock(): void
    {
        Http::fake(function () {
            $snapshot = $this->snapshot(Order::firstOrFail(), 'processed');
            $snapshot['total_amount'] = '1.00';

            return Http::response($snapshot);
        });
        $this->postJson('/api/v1/checkout/transparent', $this->payload())->assertStatus(503);
        $this->assertSame('pending', Order::firstOrFail()->status);
        $this->assertSame(4, $this->product->fresh()->stock);
    }

    public function test_verified_customer_is_required_and_runtime_config_does_not_expose_secrets(): void
    {
        $this->customer->forceFill(['email_verified_at' => null])->save();
        $this->postJson('/api/v1/checkout/transparent', $this->payload())->assertForbidden();
        $config = $this->getJson('/api/v1/runtime-config')->assertOk()->assertJsonPath('checkout.enabled', true);
        $this->assertStringNotContainsString('test-token', $config->getContent());
        $this->assertStringNotContainsString('test-webhook', $config->getContent());
        $this->assertDatabaseCount('orders', 0);
        Http::assertNothingSent();
    }
}
