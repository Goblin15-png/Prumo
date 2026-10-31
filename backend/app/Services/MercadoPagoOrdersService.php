<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class MercadoPagoOrdersService
{
    public function assertReady(): void
    {
        if ($this->simulated()) {
            return;
        }
        if (! config('services.mercado_pago.access_token') || ! config('services.mercado_pago.public_key') || ! config('services.mercado_pago.webhook_secret')) {
            $this->unavailable('O pagamento ainda não está configurado para este ambiente.');
        }
    }

    public function create(Order $order, User $user, array $payment): array
    {
        if ($this->simulated()) {
            $order->forceFill(['status' => 'paid', 'payment_status' => 'approved', 'payment_method' => $payment['type'], 'payment_expires_at' => null])->save();

            return $this->view($order) + ['test_mode' => true];
        }
        try {
            return Cache::lock('mercado-pago-orders:'.$order->id, 60)->block(25, function () use ($order, $user, $payment) {
                $order->refresh();
                if ($order->mercado_pago_order_id) {
                    return $this->view($this->refresh($order));
                }
                if ($order->status !== 'pending') {
                    return $this->view($order);
                }
                $method = $payment['type'] === 'pix'
                    ? ['id' => 'pix', 'type' => 'bank_transfer']
                    : ['id' => $payment['id'], 'type' => 'credit_card', 'token' => $payment['token'], 'installments' => (int) $payment['installments']];
                $payer = ['email' => $user->email, 'identification' => $payment['identification']];
                $names = explode(' ', trim($user->name), 2);
                $payer['first_name'] = $names[0];
                $payer['last_name'] = $names[1] ?? $names[0];
                $amount = number_format((float) $order->total_price, 2, '.', '');
                $response = Http::acceptJson()->asJson()
                    ->withToken((string) config('services.mercado_pago.access_token'))
                    ->withHeaders(['X-Idempotency-Key' => $order->checkout_idempotency_key])
                    ->connectTimeout(3)->timeout(20)
                    ->post('https://api.mercadopago.com/v1/orders', [
                        'type' => 'online', 'processing_mode' => 'automatic',
                        'external_reference' => $order->order_number, 'total_amount' => $amount,
                        'payer' => $payer,
                        'transactions' => ['payments' => [['amount' => $amount, 'payment_method' => $method]]],
                    ]);
                if (! $response->successful()) {
                    // Timeouts, rate limits, conflicts and 5xx are indeterminate: retain stock and the same idempotency key.
                    if (in_array($response->status(), [400, 401, 403, 404, 422], true)) {
                        app(CheckoutService::class)->releaseReservation($order, 'failed');

                        return $this->view($order->refresh());
                    }
                    $this->unavailable('Pagamento em confirmação. Tente consultar novamente sem iniciar outra compra.');
                }
                $snapshot = $response->json();
                if (! is_array($snapshot) || ! $this->matches($order, $snapshot)) {
                    $this->unavailable('O provedor ainda não confirmou os dados do pagamento. Consulte novamente.');
                }

                return $this->view($this->apply($order, $snapshot));
            });
        } catch (HttpResponseException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::warning('Falha no checkout Orders; reserva preservada para conciliação.', ['order_id' => $order->id, 'exception' => get_class($exception)]);
            $this->unavailable('Não foi possível confirmar o pagamento. Consulte novamente; não inicie outra compra.');
        }
    }

    public function refresh(Order $order): Order
    {
        if (! $order->mercado_pago_order_id || $this->simulated()) {
            return $order;
        }

        return $this->apply($order, $this->fetch($order->mercado_pago_order_id));
    }

    public function fetch(string $id): array
    {
        try {
            $response = Http::acceptJson()->withToken((string) config('services.mercado_pago.access_token'))
                ->connectTimeout(3)->timeout(10)->get('https://api.mercadopago.com/v1/orders/'.rawurlencode($id));
            if ($response->successful() && is_array($response->json())) {
                return $response->json();
            }
        } catch (Throwable) {
            // Do not log provider payloads or payer details.
        }
        $this->unavailable('Não foi possível consultar o pagamento agora.');
    }

    public function matches(Order $order, array $snapshot): bool
    {
        $id = $snapshot['id'] ?? null;

        return $order->checkout_request_hash !== null
            && is_string($id) && preg_match('/^[A-Za-z0-9_-]{10,100}$/D', $id)
            && (! $order->mercado_pago_order_id || $id === $order->mercado_pago_order_id)
            && ($snapshot['type'] ?? null) === 'online'
            && ($snapshot['external_reference'] ?? null) === $order->order_number
            && preg_match('/^\d+(\.\d{1,2})?$/D', (string) ($snapshot['total_amount'] ?? ''))
            && (int) round((float) $snapshot['total_amount'] * 100) === (int) round((float) $order->total_price * 100)
            && (! isset($snapshot['currency_id']) || $snapshot['currency_id'] === 'BRL')
            && (! isset($snapshot['country_code']) || $snapshot['country_code'] === 'BRA');
    }

    public function apply(Order $order, array $snapshot): Order
    {
        if (! $this->matches($order, $snapshot)) {
            $this->unavailable('Os dados do pagamento não correspondem ao pedido.');
        }

        return DB::transaction(function () use ($order, $snapshot) {
            $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (! $this->matches($order, $snapshot)) {
                $this->unavailable('Pagamento divergente.');
            }
            $version = isset($snapshot['version']) && is_numeric($snapshot['version']) ? (int) $snapshot['version'] : null;
            if ($version !== null && $order->provider_order_version !== null && $version <= $order->provider_order_version) {
                return $order;
            }
            $status = $snapshot['status'] ?? 'processing';
            $detail = $snapshot['status_detail'] ?? '';
            $payments = data_get($snapshot, 'transactions.payments', []);
            $payment = count($payments) === 1 ? $payments[0] : [];
            $approved = $status === 'processed' && $detail === 'accredited'
                && ($payment['status'] ?? null) === 'processed'
                && ($payment['status_detail'] ?? null) === 'accredited'
                && (int) round((float) ($payment['amount'] ?? 0) * 100) === (int) round((float) $order->total_price * 100);
            $updates = ['mercado_pago_order_id' => $snapshot['id']];
            if ($version !== null) {
                $updates['provider_order_version'] = $version;
            }
            $terminal = in_array($order->payment_status, ['refunded', 'charged_back', 'partially_refunded'], true);
            if ($approved && ! $terminal) {
                if (! $order->stock_reserved && ! $order->isDispatched()) {
                    $items = $order->items()->orderBy('product_id')->get();
                    $products = Product::query()->whereIn('id', $items->pluck('product_id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
                    $canReserve = $items->every(fn ($item) => $item->product_id && isset($products[$item->product_id]) && $products[$item->product_id]->stock >= $item->quantity);
                    if ($canReserve) {
                        foreach ($items as $item) {
                            $products[$item->product_id]->decrement('stock', $item->quantity);
                        }
                        $updates['stock_reserved'] = true;
                    } else {
                        $updates['inventory_issue'] = true;
                    }
                }
                $updates += ['status' => $order->status === 'shipped' ? 'shipped' : 'paid', 'payment_status' => 'approved', 'payment_id' => $payment['id'] ?? null, 'payment_expires_at' => null];
            } elseif (in_array($status, ['refunded', 'charged_back'], true) || ($status === 'processed' && $detail === 'partially_refunded')) {
                $updates['payment_status'] = $detail === 'partially_refunded' ? 'partially_refunded' : $status;
                if ($detail !== 'partially_refunded' && ! $order->isDispatched()) {
                    $this->restoreStock($order);
                    $updates += ['stock_reserved' => false, 'status' => 'cancelled'];
                }
            } elseif ($order->status === 'pending' && ! $terminal) {
                $updates['payment_status'] = in_array($status, ['failed', 'canceled', 'cancelled', 'expired'], true) ? $status : 'pending';
                if (in_array($status, ['failed', 'canceled', 'cancelled', 'expired'], true)) {
                    $this->restoreStock($order);
                    $updates += ['stock_reserved' => false, 'status' => 'cancelled'];
                }
            }
            $method = data_get($payment, 'payment_method.id') === 'pix' ? 'pix' : (data_get($payment, 'payment_method.type') === 'credit_card' ? 'credit_card' : null);
            if ($method) {
                $updates['payment_method'] = $method;
            }
            $qr = data_get($payment, 'payment_method.qr_code');
            $image = data_get($payment, 'payment_method.qr_code_base64');
            if (is_string($qr) && strlen($qr) <= 10000) {
                $updates['pix_qr_code'] = $qr;
            }
            if (is_string($image) && strlen($image) <= 300000 && str_starts_with((string) base64_decode($image, true), "\x89PNG\r\n\x1a\n")) {
                $updates['pix_qr_code_base64'] = $image;
            }
            $order->forceFill($updates)->save();

            return $order;
        });
    }

    private function restoreStock(Order $order): void
    {
        if (! $order->stock_reserved) {
            return;
        }
        foreach ($order->items()->orderBy('product_id')->get() as $item) {
            if ($item->product_id) {
                Product::query()->whereKey($item->product_id)->increment('stock', $item->quantity);
            }
        }
    }

    public function view(Order $order): array
    {
        return [
            'order_number' => $order->order_number, 'status' => $order->status, 'payment_status' => $order->payment_status,
            'payment_method' => $order->payment_method, 'total_price' => $order->total_price,
            'fulfillment_method' => $order->fulfillment_method, 'pickup_contact_name' => $order->pickup_contact_name,
            'pix_qr_code' => $order->status === 'pending' ? $order->pix_qr_code : null,
            'pix_qr_code_base64' => $order->status === 'pending' ? $order->pix_qr_code_base64 : null,
        ];
    }

    private function simulated(): bool
    {
        return app()->environment('local') && (bool) config('services.local_test_mode');
    }

    private function unavailable(string $message): never
    {
        throw new HttpResponseException(response()->json(['message' => $message], 503));
    }
}
