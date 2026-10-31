<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Services\MercadoPagoOrdersService;
use App\Services\MercadoPagoWebhookSignature;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class MercadoPagoWebhookController extends Controller
{
    public function __construct(protected MercadoPagoWebhookSignature $signature) {}

    public function receive(Request $request): JsonResponse
    {
        $type = (string) ($request->query('type') ?? $request->input('type', ''));
        if ($type === 'order') {
            return $this->receiveOrder($request);
        }
        if ($type !== 'payment') {
            return response()->json(['received' => true]);
        }

        // PHP normalizes dots in query-string keys, so Mercado Pago's data.id may arrive as data_id.
        $queryPaymentId = (string) ($request->query('data.id') ?? $request->query('data_id', ''));
        $bodyPaymentId = (string) data_get($request->all(), 'data.id', '');
        if ($queryPaymentId === '' || ! ctype_digit($queryPaymentId) || $queryPaymentId !== $bodyPaymentId) {
            return response()->json(['message' => 'Notificação inválida.'], 400);
        }

        if (! $this->signature->isValid(
            $request->header('x-signature'),
            $request->header('x-request-id'),
            $queryPaymentId,
            (string) config('services.mercado_pago.webhook_secret')
        )) {
            return response()->json(['message' => 'Notificação inválida.'], 401);
        }

        $accessToken = config('services.mercado_pago.access_token');
        if (! $accessToken) {
            return response()->json(['message' => 'Notificação indisponível.'], 503);
        }

        try {
            $paymentResponse = Http::acceptJson()
                ->withToken((string) $accessToken)
                ->connectTimeout(3)
                ->timeout(10)
                ->get('https://api.mercadopago.com/v1/payments/'.rawurlencode($queryPaymentId));
        } catch (Throwable $exception) {
            Log::warning('Falha de conexão ao consultar pagamento notificado pelo Mercado Pago.', [
                'exception' => get_class($exception),
            ]);

            return response()->json(['message' => 'Não foi possível confirmar a notificação.'], 503);
        }

        if (! $paymentResponse->successful()) {
            Log::warning('Mercado Pago não confirmou o pagamento notificado.', ['status' => $paymentResponse->status()]);

            return response()->json(['message' => 'Não foi possível confirmar a notificação.'], 503);
        }

        $payment = $paymentResponse->json();
        $orderNumber = (string) ($payment['external_reference'] ?? '');
        $order = Order::query()->where('order_number', $orderNumber)->first();
        if (! $order) {
            Log::warning('Notificação do Mercado Pago sem pedido local correspondente.');

            return response()->json(['received' => true]);
        }

        $paymentMatchesOrder = (string) ($payment['id'] ?? '') === $queryPaymentId
            && strtoupper((string) ($payment['currency_id'] ?? '')) === 'BRL'
            && $this->toCents($payment['transaction_amount'] ?? 0) === $this->toCents($order->total_price)
            && is_string($payment['preference_id'] ?? null)
            && $payment['preference_id'] === $order->payment_preference_id;

        if (! $paymentMatchesOrder) {
            Log::warning('Pagamento do Mercado Pago não corresponde ao pedido local.', [
                'order_id' => $order->id,
                'payment_id' => $queryPaymentId,
            ]);

            return response()->json(['received' => true]);
        }

        $providerEventId = (string) ($request->input('id') ?? $request->header('x-request-id') ?? '');
        if ($providerEventId === '') {
            $providerEventId = 'payment-'.$queryPaymentId.'-'.$payment['status'];
        }

        try {
            DB::transaction(function () use ($order, $payment, $queryPaymentId, $providerEventId): void {
                if (DB::table('payment_webhook_events')->where('provider_event_id', $providerEventId)->exists()) {
                    return;
                }

                DB::table('payment_webhook_events')->insert([
                    'provider_event_id' => $providerEventId,
                    'payment_id' => $queryPaymentId,
                    'event_type' => 'payment.'.mb_substr((string) ($payment['status'] ?? 'unknown'), 0, 60),
                    'processed_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->first();
                if (! $lockedOrder) {
                    return;
                }

                $providerStatus = mb_substr((string) ($payment['status'] ?? 'unknown'), 0, 40);
                $paymentMethod = $this->mapPaymentMethod(
                    (string) ($payment['payment_method_id'] ?? ''),
                    (string) ($payment['payment_type_id'] ?? '')
                );
                $updates = ['payment_status' => $providerStatus];

                if ($providerStatus === 'approved') {
                    if (! $lockedOrder->stock_reserved && ! $lockedOrder->isDispatched()) {
                        $canReserve = true;
                        foreach ($lockedOrder->items()->orderBy('product_id')->get() as $item) {
                            if (! $item->product_id) {
                                $canReserve = false;
                                break;
                            }
                            $product = Product::query()->whereKey($item->product_id)->lockForUpdate()->first();
                            if (! $product || $product->stock < $item->quantity) {
                                $canReserve = false;
                                break;
                            }
                        }

                        if ($canReserve) {
                            foreach ($lockedOrder->items()->get() as $item) {
                                Product::query()->whereKey($item->product_id)->decrement('stock', $item->quantity);
                            }
                            $updates['stock_reserved'] = true;
                        } else {
                            $updates['inventory_issue'] = true;
                        }
                    }

                    $updates['status'] = $lockedOrder->status === 'shipped' ? 'shipped' : 'paid';
                    $updates['payment_id'] = $queryPaymentId;
                    $updates['payment_method'] = $paymentMethod;
                } elseif (in_array($providerStatus, ['refunded', 'charged_back'], true)
                    && ! $lockedOrder->isDispatched()) {
                    if ($lockedOrder->stock_reserved) {
                        foreach ($lockedOrder->items()->get() as $item) {
                            if ($item->product_id) {
                                Product::query()->whereKey($item->product_id)->increment('stock', $item->quantity);
                            }
                        }
                        $updates['stock_reserved'] = false;
                    }
                    $updates['status'] = 'cancelled';
                }

                $lockedOrder->forceFill($updates)->save();
            });
        } catch (QueryException $exception) {
            if (! DB::table('payment_webhook_events')->where('provider_event_id', $providerEventId)->exists()) {
                Log::warning('Falha ao registrar evento de pagamento do Mercado Pago.', [
                    'exception' => get_class($exception),
                ]);

                return response()->json(['message' => 'Não foi possível processar a notificação.'], 503);
            }
        }

        return response()->json(['received' => true]);
    }

    private function receiveOrder(Request $request): JsonResponse
    {
        $id = (string) ($request->query('data.id') ?? $request->query('data_id', ''));
        if (! preg_match('/^[A-Za-z0-9_-]{10,100}$/D', $id) || $id !== (string) $request->input('data.id')) {
            return response()->json(['message' => 'Notificação inválida.'], 400);
        }
        if (! $this->signature->isValid($request->header('x-signature'), $request->header('x-request-id'), $id, (string) config('services.mercado_pago.webhook_secret'))) {
            return response()->json(['message' => 'Notificação inválida.'], 401);
        }
        $payments = app(MercadoPagoOrdersService::class);
        $snapshot = $payments->fetch($id);
        if (($snapshot['id'] ?? null) !== $id) {
            return response()->json(['message' => 'Notificação divergente.'], 503);
        }
        $order = Order::query()->where('order_number', $snapshot['external_reference'] ?? '')->whereNotNull('checkout_request_hash')->first();
        if (! $order) {
            return response()->json(['received' => true]);
        }
        $payments->apply($order, $snapshot);

        return response()->json(['received' => true]);
    }

    private function mapPaymentMethod(string $method, string $type): ?string
    {
        $method = strtolower($method);
        $type = strtolower($type);
        if ($method === 'pix') {
            return 'pix';
        }
        if ($type === 'ticket' || str_contains($method, 'boleto')) {
            return 'boleto';
        }
        if (in_array($type, ['credit_card', 'debit_card', 'prepaid_card'], true)) {
            return 'credit_card';
        }

        return null;
    }

    private function toCents(mixed $amount): int
    {
        return (int) round((float) $amount * 100);
    }
}
