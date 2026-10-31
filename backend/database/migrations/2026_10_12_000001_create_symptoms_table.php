<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('symptoms', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150)->unique();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        $now = now();
        DB::table('symptoms')->insert(array_map(
            fn ($name) => ['name' => $name, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            [
                'Dor de Cabeça / Enxaqueca',
                'Ansiedade / Estresse',
                'Insônia / Sono',
                'TPM / Saúde Hormonal Feminina',
                'Dores Musculares / Tensão',
                'Foco / Concentração',
            ]
        ));
    }

    public function down(): void
    {
        Schema::dropIfExists('symptoms');
    }
};
