<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('order_number', 50)->unique();
            $table->decimal('total_price', 10, 2);
            $table->enum('status', ['pending', 'paid', 'shipped', 'cancelled'])->default('pending');
            $table->enum('payment_method', ['pix', 'credit_card', 'boleto']);
            $table->string('tracking_code', 100)->nullable();
            $table->string('shipping_method', 100)->default('PAC'); // Ex: PAC, SEDEX, Retirada na Loja Física
            $table->decimal('shipping_cost', 10, 2)->default(0.00);

            // Dados de Gateway e Pix (sem dados sensíveis de cartão - PCI-DSS)
            $table->string('payment_id', 150)->nullable();
            $table->text('pix_qr_code')->nullable();
            $table->text('pix_qr_code_base64')->nullable();
            $table->text('boleto_barcode')->nullable();
            $table->text('boleto_url')->nullable();
            $table->json('shipping_address')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name', 180);
            $table->decimal('unit_price', 10, 2);
            $table->integer('quantity');
            $table->decimal('subtotal', 10, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
