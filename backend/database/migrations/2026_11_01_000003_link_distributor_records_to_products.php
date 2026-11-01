<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['distributor_inventory', 'distributor_purchase_plans'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->string('product_name', 255)->change();
                $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (['distributor_inventory', 'distributor_purchase_plans'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropConstrainedForeignId('product_id');
            });
        }
    }
};
