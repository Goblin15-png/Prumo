<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedInteger('sort_order')->default(0);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('category_position')->default(0);
        });

        foreach (DB::table('categories')->orderBy('id')->pluck('id')->values() as $index => $id) {
            DB::table('categories')->where('id', $id)->update(['sort_order' => $index]);
        }

        $productIds = DB::table('products')->whereNotNull('category_id')->orderBy('category_id')->orderBy('id')->get(['id', 'category_id']);
        $positions = [];
        foreach ($productIds as $product) {
            $position = $positions[$product->category_id] ?? 0;
            DB::table('products')->where('id', $product->id)->update(['category_position' => $position]);
            $positions[$product->category_id] = $position + 1;
        }
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('category_position');
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('sort_order');
        });
    }
};
