<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ShippingQuoteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.local_test_mode' => false,
            'services.melhor_envio.token' => 'fake-shipping-token',
            'services.melhor_envio.origin_cep' => '00000-000',
            'services.melhor_envio.environment' => 'sandbox',
            'services.melhor_envio.user_agent' => 'Loja de teste (dev@example.test)',
        ]);
        Http::preventStrayRequests();
    }

    private function product(array $changes = []): Product
    {
        return Product::create(array_replace([
            'name' => 'Blend fictício',
            'slug' => 'blend-ficticio',
            'price' => 29.90,
            'stock' => 5,
            'is_active' => true,
            'shipping_width_cm' => 8,
            'shipping_height_cm' => 10,
            'shipping_length_cm' => 12,
            'shipping_weight_kg' => 0.125,
        ], $changes));
    }

    private function payload(Product $product): array
    {
        return ['postal_code' => '00000-001', 'items' => [['product_id' => $product->id, 'quantity' => 2]]];
    }

    private function quote(array $changes = []): array
    {
        return array_replace([
            'id' => 1,
            'name' => 'PAC',
            'price' => '30.00',
            'custom_price' => '18.50',
            'delivery_time' => 8,
            'custom_delivery_time' => 4,
            'company' => ['name' => 'Correios'],
        ], $changes);
    }

    public function test_quote_uses_server_values_in_each_environment_with_bounded_requests(): void
    {
        $product = $this->product();
        $requestContext = null;
        Http::fake(function ($request, $options) use (&$requestContext) {
            $requestContext = [$request, $options];

            return Http::response([$this->quote()]);
        });
        foreach (['sandbox' => 'https://sandbox.melhorenvio.com.br', 'production' => 'https://melhorenvio.com.br'] as $environment => $baseUrl) {
            config(['services.melhor_envio.environment' => $environment]);
            $this->postJson('/api/v1/shipping/calculate', array_replace($this->payload($product), ['price' => 0.01, 'width' => 1, 'weight' => 1]))
                ->assertOk()->assertExactJson(['data' => [['id' => 1, 'name' => 'PAC', 'company' => 'Correios', 'price' => 18.5, 'delivery_time' => 4]]]);
            [$request, $options] = $requestContext;
            $this->assertSame($baseUrl.'/api/v2/me/shipment/calculate', $request->url());
            $this->assertSame('POST', $request->method());
            $this->assertTrue($request->hasHeader('Authorization', 'Bearer fake-shipping-token'));
            $this->assertTrue($request->hasHeader('User-Agent', 'Loja de teste (dev@example.test)'));
            $this->assertFalse($options['allow_redirects']);
            $this->assertSame(3, $options['connect_timeout']);
            $this->assertSame(10, $options['timeout']);
            $this->assertSame([
                'from' => ['postal_code' => '00000000'],
                'to' => ['postal_code' => '00000001'],
                'products' => [['id' => (string) $product->id, 'width' => 8.0, 'height' => 10.0, 'length' => 12.0, 'weight' => 0.125, 'insurance_value' => 29.9, 'quantity' => 2]],
                'options' => ['receipt' => false, 'own_hand' => false],
            ], $request->data());
        }
        Http::assertSentCount(2);
    }

    public function test_incomplete_or_invalid_configuration_never_reaches_provider(): void
    {
        $product = $this->product();
        foreach (['token' => '', 'origin_cep' => '123', 'environment' => 'productions', 'user_agent' => ''] as $key => $value) {
            $original = config('services.melhor_envio.'.$key);
            config(['services.melhor_envio.'.$key => $value]);
            $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertStatus(503)
                ->assertExactJson(['message' => 'A cotação de frete ainda não está configurada.']);
            config(['services.melhor_envio.'.$key => $original]);
        }
        config(['services.melhor_envio.user_agent' => 'Pruma Essential (suporte@seudominio.com.br)']);
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_missing_package_data_and_unavailable_products_are_rejected_before_http(): void
    {
        $product = $this->product(['shipping_weight_kg' => null]);
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertUnprocessable()->assertJsonValidationErrors('items');
        $product->update(['shipping_weight_kg' => 0.125, 'stock' => 1]);
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertUnprocessable()->assertJsonValidationErrors('items');
        $product->update(['stock' => 5, 'is_active' => false]);
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertUnprocessable()->assertJsonValidationErrors('items');
        Http::assertNothingSent();
    }

    public function test_provider_failures_and_redirects_return_no_credentials_or_upstream_details(): void
    {
        $product = $this->product();
        $sequence = Http::fakeSequence();
        foreach ([401, 403, 422, 429, 500, 302] as $status) {
            $sequence->push(['message' => 'fake-shipping-token private upstream details'], $status, ['Location' => 'https://example.invalid']);
        }
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertStatus(503)
                ->assertExactJson(['message' => 'Não foi possível consultar o frete agora. Tente novamente mais tarde.']);
        }
        Http::assertSentCount(6);
    }

    public function test_connection_timeout_returns_retryable_error_without_leaking_token(): void
    {
        $product = $this->product();
        Http::fake(fn () => throw new ConnectionException('fake-shipping-token private error'));
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertStatus(503)
            ->assertExactJson(['message' => 'Não foi possível consultar o frete agora. Tente novamente mais tarde.']);
    }

    public function test_malformed_provider_body_is_not_presented_as_an_empty_quote(): void
    {
        $product = $this->product();
        Http::fakeSequence()->push('not json')->push(['message' => 'invalid envelope']);
        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertStatus(503);
        }
    }

    public function test_unavailable_and_invalid_options_are_removed_preserving_valid_custom_values(): void
    {
        $product = $this->product();
        Http::fakeSequence()->push([
            $this->quote(['error' => 'Serviço indisponível']),
            $this->quote(['custom_price' => '12 invalid']),
            $this->quote(['custom_price' => '1e309']),
            $this->quote(['custom_price' => -1]),
            $this->quote(['custom_delivery_time' => 'invalid']),
            $this->quote(['custom_delivery_time' => -1]),
            $this->quote(['custom_delivery_time' => 1.5]),
            $this->quote(['id' => 'invalid']),
            $this->quote(['name' => ['invalid']]),
            $this->quote(['company' => ['name' => ['invalid']]]),
            $this->quote(['id' => 2, 'custom_price' => null, 'custom_delivery_time' => null]),
            $this->quote(),
        ])->push([]);
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertOk()->assertExactJson(['data' => [
            ['id' => 2, 'name' => 'PAC', 'company' => 'Correios', 'price' => 30.0, 'delivery_time' => 8],
            ['id' => 1, 'name' => 'PAC', 'company' => 'Correios', 'price' => 18.5, 'delivery_time' => 4],
        ]]);
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertOk()->assertExactJson(['data' => []]);
    }

    public function test_simulation_requires_local_environment_and_never_calls_external_provider(): void
    {
        $product = $this->product(['shipping_weight_kg' => null]);
        config(['services.local_test_mode' => true, 'services.melhor_envio.token' => '']);
        $this->app->instance('env', 'production');
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertStatus(503);
        $this->app->instance('env', 'local');
        $this->postJson('/api/v1/shipping/calculate', $this->payload($product))->assertOk()
            ->assertJsonPath('data.0.name', 'Entrega simulada')->assertJsonPath('data.0.price', 12.9);
        Http::assertNothingSent();
    }
}
