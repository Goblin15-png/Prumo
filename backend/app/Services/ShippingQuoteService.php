<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

class ShippingQuoteService
{
    /**
     * Quote active products using only product and packaging values stored by the server.
     * Items must already have passed request validation.
     */
    public function calculate(string $postalCode, array $items): Collection
    {
        $localTestMode = app()->environment('local') && (bool) config('services.local_test_mode');
        $token = trim((string) config('services.melhor_envio.token'));
        $originPostalCode = preg_replace('/\D/', '', (string) config('services.melhor_envio.origin_cep'));
        $environment = config('services.melhor_envio.environment');
        $userAgent = trim((string) config('services.melhor_envio.user_agent'));

        if (! $localTestMode && ($token === '' || strlen($originPostalCode) !== 8
            || ! in_array($environment, ['sandbox', 'production'], true)
            || $userAgent === '' || str_contains(strtolower($userAgent), 'seudominio.com.br'))) {
            throw new HttpResponseException(response()->json([
                'message' => 'A cotação de frete ainda não está configurada.',
            ], 503));
        }

        $itemsByProduct = collect($items)->keyBy('product_id');
        $products = Product::query()
            ->whereIn('id', $itemsByProduct->keys())
            ->where('is_active', true)
            ->get();

        if ($products->count() !== $itemsByProduct->count()) {
            throw ValidationException::withMessages([
                'items' => ['Um ou mais produtos não estão disponíveis para envio.'],
            ]);
        }

        $shippingProducts = [];
        foreach ($products as $product) {
            $quantity = (int) $itemsByProduct[$product->id]['quantity'];
            if ($product->stock < $quantity) {
                throw ValidationException::withMessages([
                    'items' => ['Estoque insuficiente para um ou mais produtos.'],
                ]);
            }

            if (! $localTestMode && (! $product->shipping_width_cm || ! $product->shipping_height_cm || ! $product->shipping_length_cm || ! $product->shipping_weight_kg)) {
                throw ValidationException::withMessages([
                    'items' => ['Há produtos sem peso e dimensões de embalagem cadastrados.'],
                ]);
            }

            $shippingProducts[] = [
                'id' => (string) $product->id,
                'width' => (float) $product->shipping_width_cm,
                'height' => (float) $product->shipping_height_cm,
                'length' => (float) $product->shipping_length_cm,
                'weight' => (float) $product->shipping_weight_kg,
                'insurance_value' => (float) $product->price,
                'quantity' => $quantity,
            ];
        }

        if ($localTestMode) {
            return collect([[
                'id' => 1,
                'name' => 'Entrega simulada',
                'company' => 'Teste local',
                'price' => 12.90,
                'delivery_time' => 3,
            ]]);
        }

        $baseUrl = $environment === 'production'
            ? 'https://melhorenvio.com.br'
            : 'https://sandbox.melhorenvio.com.br';

        try {
            $response = Http::acceptJson()
                ->asJson()
                ->withToken($token)
                ->withHeaders(['User-Agent' => $userAgent])
                ->withoutRedirecting()
                ->connectTimeout(3)
                ->timeout(10)
                ->post($baseUrl.'/api/v2/me/shipment/calculate', [
                    'from' => ['postal_code' => $originPostalCode],
                    'to' => ['postal_code' => preg_replace('/\D/', '', $postalCode)],
                    'products' => $shippingProducts,
                    'options' => ['receipt' => false, 'own_hand' => false],
                ]);
        } catch (Throwable $exception) {
            Log::warning('Falha de conexão durante cotação no Melhor Envio.', [
                'exception' => get_class($exception),
            ]);

            throw new HttpResponseException(response()->json([
                'message' => 'Não foi possível consultar o frete agora. Tente novamente mais tarde.',
            ], 503));
        }

        if (! $response->successful()) {
            Log::warning('Falha na cotação do Melhor Envio.', ['status' => $response->status()]);

            throw new HttpResponseException(response()->json([
                'message' => 'Não foi possível consultar o frete agora. Tente novamente mais tarde.',
            ], 503));
        }

        $quotes = $response->json();
        if (! is_array($quotes) || ! array_is_list($quotes)) {
            throw new HttpResponseException(response()->json([
                'message' => 'Não foi possível consultar o frete agora. Tente novamente mais tarde.',
            ], 503));
        }

        return collect($quotes)
            ->map(fn ($quote) => $this->normalizeQuote($quote))
            ->filter()
            ->values();
    }

    private function normalizeQuote(mixed $quote): ?array
    {
        if (! is_array($quote) || ! empty($quote['error']) || ! is_string($quote['name'] ?? null)) {
            return null;
        }

        $id = filter_var($quote['id'] ?? null, FILTER_VALIDATE_INT);
        $price = $quote['custom_price'] ?? $quote['price'] ?? null;
        $deliveryTime = filter_var($quote['custom_delivery_time'] ?? $quote['delivery_time'] ?? null, FILTER_VALIDATE_INT);
        $company = data_get($quote, 'company.name', '');

        if ($id === false || $id <= 0 || trim($quote['name']) === '' || ! is_string($company)
            || ! is_numeric($price) || ! is_finite((float) $price) || (float) $price <= 0
            || $deliveryTime === false || $deliveryTime < 0) {
            return null;
        }

        return [
            'id' => $id,
            'name' => mb_substr($quote['name'], 0, 100),
            'company' => mb_substr($company, 0, 100),
            'price' => (float) $price,
            'delivery_time' => $deliveryTime,
        ];
    }
}
