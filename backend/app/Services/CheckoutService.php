<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class CheckoutService
{
    public function __construct(protected ShippingQuoteService $shippingQuoteService) {}

    public function create(User $user, array $data, bool $transparent = false): array
    {
        $this->assertGatewayReady();
        $orders = $transparent ? app(MercadoPagoOrdersService::class) : null;
        if ($orders) {
            $orders->assertReady();
        }
        $requestHash = $transparent ? hash('sha256', json_encode($data, JSON_THROW_ON_ERROR)) : null;

        if ($existingOrder = $this->findByIdempotencyKey($user, $data['idempotency_key'])) {
            if (! $transparent && $existingOrder->checkout_request_hash) {
                throw new HttpResponseException(response()->json(['message' => 'Tentativa vinculada ao checkout transparente.'], 409));
            }
            if ($transparent) {
                if (! hash_equals((string) $existingOrder->checkout_request_hash, $requestHash)) {
                    throw new HttpResponseException(response()->json(['message' => 'Esta tentativa já está vinculada a outros dados. Consulte a compra existente.'], 409));
                }

                return $orders->create($existingOrder, $user, $data['payment']);
            }
            if ($this->isLocalTestMode() && in_array($existingOrder->status, ['pending', 'paid'], true)) {
                return $this->completeLocalTestCheckout($existingOrder, true);
            }

            if ($existingOrder->status !== 'pending') {
                return $this->existingCheckout($existingOrder);
            }

            return $this->createPreferenceForOrder($existingOrder, $user);
        }

        $pickup = $transparent && ($data['fulfillment_method'] ?? 'delivery') === 'pickup';
        if ($pickup) {
            if (! config('services.pickup.enabled') || ! trim((string) config('services.pickup.instructions'))) {
                throw ValidationException::withMessages(['fulfillment_method' => ['Retirada em loja indisponível.']]);
            }
            $quote = ['id' => 0, 'company' => '', 'name' => 'Retirada em loja', 'price' => 0];
        } else {
            $quotes = $this->shippingQuoteService->calculate($data['postal_code'], $data['items']);
            $quote = $quotes->first(fn (array $candidate) => $candidate['id'] === (int) $data['shipping_option_id']);
        }
        if (! $quote || $this->toCents($quote['price']) !== $this->toCents($data['expected_shipping_price'])) {
            throw ValidationException::withMessages([
                'shipping_option_id' => ['O valor ou a opção de frete mudou. Recalcule e escolha a entrega novamente.'],
            ]);
        }

        try {
            $order = DB::transaction(function () use ($user, $data, $quote, $transparent, $requestHash, $pickup): Order {
                $existing = $this->findByIdempotencyKey($user, $data['idempotency_key']);
                if ($existing) {
                    return $existing;
                }

                $itemIds = collect($data['items'])->pluck('product_id')->map(fn ($id) => (int) $id)->sort()->values();
                $products = Product::query()
                    ->whereIn('id', $itemIds)
                    ->where('is_active', true)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('id');

                if ($products->count() !== $itemIds->count()) {
                    throw ValidationException::withMessages(['items' => ['Um ou mais produtos não estão disponíveis.']]);
                }

                $subtotalCents = 0;
                foreach ($data['items'] as $line) {
                    $product = $products->get((int) $line['product_id']);
                    $quantity = (int) $line['quantity'];
                    if (! $product || ! $product->is_active || $product->stock < $quantity) {
                        throw ValidationException::withMessages(['items' => ['Estoque insuficiente para um ou mais produtos.']]);
                    }
                    $subtotalCents += $this->toCents($product->price) * $quantity;
                }

                if ($subtotalCents !== $this->toCents($data['expected_subtotal'])) {
                    throw ValidationException::withMessages([
                        'items' => ['O preço de um produto mudou. Revise a sacola antes de pagar.'],
                    ]);
                }

                if (! $this->isLocalTestMode()) {
                    foreach ($data['items'] as $line) {
                        $product = $products->get((int) $line['product_id']);
                        $product->decrement('stock', (int) $line['quantity']);
                    }
                }

                $order = Order::create([
                    'user_id' => $user->id,
                    'order_number' => 'PC-'.Str::upper(Str::random(14)),
                    'total_price' => ($subtotalCents + $this->toCents($quote['price'])) / 100,
                    'status' => 'pending',
                    'payment_method' => null,
                    'payment_status' => 'pending',
                    'checkout_idempotency_key' => $data['idempotency_key'],
                    'stock_reserved' => ! $this->isLocalTestMode(),
                    'payment_expires_at' => now()->addHours(24),
                    'shipping_method' => mb_substr(trim($quote['company'].' '.$quote['name']), 0, 100),
                    'shipping_cost' => $quote['price'],
                    'shipping_address' => $pickup ? null : $data['shipping_address'],
                ]);

                if ($transparent) {
                    $order->forceFill(['checkout_request_hash' => $requestHash, 'fulfillment_method' => $pickup ? 'pickup' : 'delivery', 'pickup_contact_name' => $pickup ? trim($data['pickup_contact_name']) : null])->save();
                }

                foreach ($data['items'] as $line) {
                    $product = $products->get((int) $line['product_id']);
                    $quantity = (int) $line['quantity'];
                    $unitPriceCents = $this->toCents($product->price);
                    $order->items()->create([
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'unit_price' => $unitPriceCents / 100,
                        'quantity' => $quantity,
                        'subtotal' => ($unitPriceCents * $quantity) / 100,
                    ]);
                }

                return $order->load('items');
            });
        } catch (QueryException $exception) {
            if ($existingOrder = $this->findByIdempotencyKey($user, $data['idempotency_key'])) {
                if ($transparent) {
                    if (! hash_equals((string) $existingOrder->checkout_request_hash, $requestHash)) {
                        throw new HttpResponseException(response()->json(['message' => 'Tentativa vinculada a outros dados. Consulte a compra existente.'], 409));
                    }

                    return $orders->create($existingOrder, $user, $data['payment']);
                }
                if ($this->isLocalTestMode() && in_array($existingOrder->status, ['pending', 'paid'], true)) {
                    return $this->completeLocalTestCheckout($existingOrder, true);
                }

                return $this->createPreferenceForOrder($existingOrder, $user);
            }

            throw $exception;
        }

        if ($transparent) {
            if (! hash_equals((string) $order->checkout_request_hash, $requestHash)) {
                throw new HttpResponseException(response()->json(['message' => 'Tentativa vinculada a outros dados.'], 409));
            }

            return $orders->create($order, $user, $data['payment']);
        }

        return $this->isLocalTestMode()
            ? $this->completeLocalTestCheckout($order)
            : $this->createPreferenceForOrder($order, $user);
    }

    private function completeLocalTestCheckout(Order $order, bool $reused = false): array
    {
        if ($order->status === 'pending') {
            $order->forceFill([
                'status' => 'paid',
                'payment_status' => 'approved',
                'payment_method' => null,
                'stock_reserved' => false,
                'payment_checkout_url' => null,
                'payment_expires_at' => null,
            ])->save();
        }

        return [
            'order_number' => $order->order_number,
            'checkout_url' => rtrim((string) config('app.frontend_url'), '/').'/?pagamento=retorno&modo_teste=1',
            'reused' => $reused,
            'test_mode' => true,
        ];
    }

    private function createPreferenceForOrder(Order $order, User $user): array
    {
        if ($order->checkout_request_hash) {
            throw new HttpResponseException(response()->json(['message' => 'Tentativa vinculada ao checkout transparente.'], 409));
        }
        try {
            $checkout = Cache::lock('mercado-pago-preference:'.$order->id, 60)->block(25, function () use ($order, $user): array {
                $lockedOrder = Order::query()->findOrFail($order->id);
                if ($lockedOrder->payment_checkout_url && $lockedOrder->status === 'pending') {
                    return ['checkout_url' => $lockedOrder->payment_checkout_url, 'reused' => true];
                }

                if ($lockedOrder->status !== 'pending') {
                    throw new HttpResponseException(response()->json([
                        'message' => 'Esta tentativa de compra não pode ser reutilizada. Reabra a sacola e tente novamente.',
                    ], 409));
                }

                $preference = Http::acceptJson()
                    ->asJson()
                    ->withToken((string) config('services.mercado_pago.access_token'))
                    ->connectTimeout(3)
                    ->timeout(20)
                    ->post('https://api.mercadopago.com/checkout/preferences', $this->preferencePayload($lockedOrder, $user));

                if (! $preference->successful()) {
                    Log::warning('Mercado Pago recusou a criação de uma preferência.', ['status' => $preference->status()]);
                    $this->releaseReservation($lockedOrder, 'preference_error');

                    throw new HttpResponseException(response()->json([
                        'message' => 'Não foi possível iniciar o pagamento. Tente novamente.',
                    ], 503));
                }

                $providerData = $preference->json();
                $checkoutUrl = config('services.mercado_pago.environment') === 'production'
                    ? ($providerData['init_point'] ?? null)
                    : ($providerData['sandbox_init_point'] ?? $providerData['init_point'] ?? null);

                if (! is_string($providerData['id'] ?? null) || ! $this->isMercadoPagoCheckoutUrl($checkoutUrl)) {
                    Log::warning('Mercado Pago retornou uma preferência incompleta.');
                    $this->releaseReservation($lockedOrder, 'preference_error');

                    throw new HttpResponseException(response()->json([
                        'message' => 'Não foi possível iniciar o pagamento. Tente novamente.',
                    ], 503));
                }

                $lockedOrder->forceFill([
                    'payment_preference_id' => $providerData['id'],
                    'payment_checkout_url' => $checkoutUrl,
                ])->save();

                return ['checkout_url' => $checkoutUrl, 'reused' => false];
            });
        } catch (LockTimeoutException) {
            throw new HttpResponseException(response()->json([
                'message' => 'Seu pagamento está sendo preparado. Aguarde alguns segundos e tente novamente.',
            ], 409));
        } catch (HttpResponseException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::warning('Falha de conexão ao criar preferência no Mercado Pago.', [
                'exception' => get_class($exception),
            ]);
            $this->releaseReservation($order, 'preference_error');

            throw new HttpResponseException(response()->json([
                'message' => 'Não foi possível iniciar o pagamento. Tente novamente.',
            ], 503));
        }

        return [
            'order_number' => $order->order_number,
            'checkout_url' => $checkout['checkout_url'],
            'reused' => $checkout['reused'],
        ];
    }

    public function releaseReservation(Order $order, string $paymentStatus): void
    {
        DB::transaction(function () use ($order, $paymentStatus): void {
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->first();
            if (! $lockedOrder || ! $lockedOrder->stock_reserved || $lockedOrder->status !== 'pending') {
                return;
            }

            foreach ($lockedOrder->items()->get() as $item) {
                if ($item->product_id) {
                    Product::query()->whereKey($item->product_id)->increment('stock', $item->quantity);
                }
            }

            $lockedOrder->forceFill([
                'stock_reserved' => false,
                'status' => 'cancelled',
                'payment_status' => $paymentStatus,
            ])->save();
        });
    }

    private function preferencePayload(Order $order, User $user): array
    {
        $items = $order->items->map(fn ($item) => [
            'id' => (string) $item->product_id,
            'title' => mb_substr($item->product_name, 0, 250),
            'currency_id' => 'BRL',
            'quantity' => $item->quantity,
            'unit_price' => (float) $item->unit_price,
        ])->all();

        if ($this->toCents($order->shipping_cost) > 0) {
            $items[] = [
                'id' => 'shipping',
                'title' => 'Frete — '.mb_substr($order->shipping_method, 0, 180),
                'currency_id' => 'BRL',
                'quantity' => 1,
                'unit_price' => (float) $order->shipping_cost,
            ];
        }

        $expiresAt = now()->addHours(24);
        $payload = [
            'items' => $items,
            'payer' => ['email' => $user->email, 'name' => mb_substr($user->name, 0, 100)],
            'external_reference' => $order->order_number,
            'statement_descriptor' => 'PRUMA ESSENTIAL',
            'expires' => true,
            'expiration_date_from' => now()->subMinute()->toIso8601String(),
            'expiration_date_to' => $expiresAt->toIso8601String(),
        ];

        $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
        if ($this->isHttpsUrl($frontendUrl)) {
            $returnUrl = $frontendUrl.'/?view=minha-conta&pagamento=retorno';
            $payload['back_urls'] = [
                'success' => $returnUrl,
                'pending' => $returnUrl,
                'failure' => $returnUrl,
            ];
            $payload['auto_return'] = 'approved';
        }

        $webhookUrl = $this->webhookUrl();
        if ($this->isHttpsUrl($webhookUrl)) {
            $payload['notification_url'] = $webhookUrl;
        }

        return $payload;
    }

    private function assertGatewayReady(): void
    {
        if ($this->isLocalTestMode()) {
            return;
        }

        $webhookUrl = $this->webhookUrl();
        $frontendUrl = (string) config('app.frontend_url');
        $productionUrlsReady = app()->environment('production')
            ? $this->isHttpsUrl($webhookUrl) && $this->isHttpsUrl($frontendUrl)
            : true;

        if (! config('services.mercado_pago.access_token')
            || ! config('services.mercado_pago.webhook_secret')
            || ! $productionUrlsReady) {
            throw new HttpResponseException(response()->json([
                'message' => 'O pagamento ainda não está configurado para este ambiente.',
            ], 503));
        }
    }

    private function isLocalTestMode(): bool
    {
        return app()->environment('local') && (bool) config('services.local_test_mode');
    }

    private function webhookUrl(): string
    {
        $configured = (string) config('services.mercado_pago.webhook_url');
        if ($configured !== '') {
            return $configured;
        }

        return rtrim((string) config('app.url'), '/').'/api/v1/payments/mercado-pago/webhook';
    }

    private function existingCheckout(Order $order): array
    {
        if ($order->status === 'pending' && $order->payment_checkout_url) {
            return [
                'order_number' => $order->order_number,
                'checkout_url' => $order->payment_checkout_url,
                'reused' => true,
            ];
        }

        throw new HttpResponseException(response()->json([
            'message' => 'Esta tentativa de compra não pode ser reutilizada. Reabra a sacola e tente novamente.',
        ], 409));
    }

    private function findByIdempotencyKey(User $user, string $key): ?Order
    {
        return Order::query()
            ->where('user_id', $user->id)
            ->where('checkout_idempotency_key', $key)
            ->first();
    }

    private function isHttpsUrl(?string $url): bool
    {
        return is_string($url) && parse_url($url, PHP_URL_SCHEME) === 'https' && parse_url($url, PHP_URL_HOST) !== null;
    }

    private function isMercadoPagoCheckoutUrl(mixed $url): bool
    {
        if (! is_string($url) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
            return false;
        }

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return preg_match('/(^|\.)mercadopago\.com(\.br)?$/', $host) === 1
            || preg_match('/(^|\.)mercadolibre\.com(\.br)?$/', $host) === 1;
    }

    private function toCents(mixed $amount): int
    {
        return (int) round((float) $amount * 100);
    }
}
