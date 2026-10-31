<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\CheckoutService;
use App\Services\MercadoPagoOrdersService;
use Illuminate\Console\Command;

class ExpirePendingOrders extends Command
{
    protected $signature = 'orders:expire-pending';

    protected $description = 'Libera estoque reservado por checkouts do Mercado Pago expirados';

    public function handle(CheckoutService $checkoutService): int
    {
        Order::query()
            ->where('status', 'pending')
            ->where('stock_reserved', true)
            ->whereNotNull('payment_expires_at')
            ->where('payment_expires_at', '<=', now())
            ->orderBy('id')
            ->chunkById(100, function ($orders) use ($checkoutService): void {
                foreach ($orders as $order) {
                    if ($order->checkout_request_hash) {
                        // A local deadline cannot cancel a provider payment. Reconcile before releasing stock.
                        try {
                            app(MercadoPagoOrdersService::class)->refresh($order);
                        } catch (\Throwable) {
                            $this->warn('Conciliação pendente para '.$order->order_number);
                        }
                    } else {
                        $checkoutService->releaseReservation($order, 'expired');
                    }
                }
            });

        return self::SUCCESS;
    }
}
