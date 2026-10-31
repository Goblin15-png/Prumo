<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('shipping_width_cm', 8, 2)->nullable()->after('stock');
            $table->decimal('shipping_height_cm', 8, 2)->nullable()->after('shipping_width_cm');
            $table->decimal('shipping_length_cm', 8, 2)->nullable()->after('shipping_height_cm');
            $table->decimal('shipping_weight_kg', 8, 3)->nullable()->after('shipping_length_cm');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn([
                'shipping_width_cm',
                'shipping_height_cm',
                'shipping_length_cm',
                'shipping_weight_kg',
            ]);
        });
    }
};
