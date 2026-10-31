<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 180);
            $table->string('slug', 200)->unique();
            $table->decimal('price', 10, 2);
            $table->integer('stock')->default(0);
            $table->text('short_description')->nullable();
            $table->longText('therapeutic_description')->nullable();
            $table->string('symptom_target', 150)->nullable(); // Ex: "Ansiedade / Estresse", "Insônia / Sono"
            $table->json('images')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sales_count')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'stock']);
            $table->index('symptom_target');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
