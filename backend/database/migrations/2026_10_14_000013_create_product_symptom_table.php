<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_symptom', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('symptom_id')->constrained()->cascadeOnDelete();
            $table->primary(['product_id', 'symptom_id']);
        });

        // Somente associa nomes já cadastrados. Textos legados continuam preservados no produto.
        DB::table('products')->whereNotNull('symptom_target')->orderBy('id')->chunkById(200, function ($products): void {
            foreach ($products as $product) {
                $symptomId = DB::table('symptoms')->where('name', $product->symptom_target)->value('id');
                if ($symptomId !== null) {
                    DB::table('product_symptom')->insert(['product_id' => $product->id, 'symptom_id' => $symptomId]);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_symptom');
    }
};
