<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $postgres = DB::getDriverName() === 'pgsql';
        Schema::table('orders', function (Blueprint $table) use ($postgres) {
            // Mantém o CHECK já existente; ALTER TYPE com enum()->change() é inválido em PostgreSQL.
            if ($postgres) {
                $table->string('payment_method', 255)->nullable()->change();
            } else {
                $table->enum('payment_method', ['pix', 'credit_card', 'boleto'])->nullable()->change();
            }
            $table->string('payment_preference_id', 150)->nullable();
            $table->text('payment_checkout_url')->nullable();
            $table->uuid('checkout_idempotency_key')->nullable()->unique();
            $table->string('payment_status', 40)->nullable();
            $table->boolean('stock_reserved')->default(false);
            $table->timestamp('payment_expires_at')->nullable();
            $table->boolean('inventory_issue')->default(false);
        });

        Schema::create('payment_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider_event_id', 120)->unique();
            $table->string('payment_id', 120)->index();
            $table->string('event_type', 80);
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });

        foreach (DB::table('orders')->whereNotNull('shipping_address')->cursor() as $order) {
            $address = json_decode($order->shipping_address, true);
            if (is_array($address)) {
                DB::table('orders')->where('id', $order->id)->update([
                    'shipping_address' => Crypt::encryptString(json_encode($address, JSON_THROW_ON_ERROR)),
                ]);
            }
        }
    }

    public function down(): void
    {
        if (DB::table('orders')->whereNull('payment_method')->exists()) {
            throw new RuntimeException('Não é possível reverter a forma de pagamento enquanto existirem pedidos sem método confirmado.');
        }

        foreach (DB::table('orders')->whereNotNull('shipping_address')->cursor() as $order) {
            try {
                $address = json_decode(Crypt::decryptString($order->shipping_address), true);
            } catch (Throwable) {
                continue;
            }

            if (is_array($address)) {
                DB::table('orders')->where('id', $order->id)->update([
                    'shipping_address' => json_encode($address, JSON_THROW_ON_ERROR),
                ]);
            }
        }

        Schema::dropIfExists('payment_webhook_events');
        $postgres = DB::getDriverName() === 'pgsql';
        Schema::table('orders', function (Blueprint $table) use ($postgres) {
            $table->dropUnique(['checkout_idempotency_key']);
            $table->dropColumn([
                'payment_preference_id',
                'payment_checkout_url',
                'checkout_idempotency_key',
                'payment_status',
                'stock_reserved',
                'payment_expires_at',
                'inventory_issue',
            ]);
            if ($postgres) {
                $table->string('payment_method', 255)->nullable(false)->change();
            } else {
                $table->enum('payment_method', ['pix', 'credit_card', 'boleto'])->nullable(false)->change();
            }
        });
    }
};
