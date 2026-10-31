<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_product', function (Blueprint $table) {
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->primary(['category_id', 'product_id']);
            $table->index(['category_id', 'sort_order']);
        });
        DB::table('products')->whereNotNull('category_id')->orderBy('id')->chunkById(200, function ($products): void {
            foreach ($products as $product) {
                DB::table('category_product')->insert([
                    'category_id' => $product->category_id,
                    'product_id' => $product->id,
                    'sort_order' => $product->category_position ?? 0,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_product');
    }
};
