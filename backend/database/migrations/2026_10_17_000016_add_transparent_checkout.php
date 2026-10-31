<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('mercado_pago_order_id', 100)->nullable()->unique();
            $table->unsignedBigInteger('provider_order_version')->nullable();
            $table->string('checkout_request_hash', 64)->nullable();
            $table->text('pickup_contact_name')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropUnique(['mercado_pago_order_id']);
            $table->dropColumn(['mercado_pago_order_id', 'provider_order_version', 'checkout_request_hash', 'pickup_contact_name']);
        });
    }
};
