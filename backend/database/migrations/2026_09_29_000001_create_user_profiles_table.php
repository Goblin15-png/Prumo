<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('sexo', ['Masculino', 'Feminino', 'Outro', 'Prefiro não dizer']);
            $table->date('data_nascimento')->nullable();
            $table->string('numero_telefone', 30)->nullable();
            $table->string('problema_principal', 150);
            $table->string('canal_aquisicao', 100)->nullable();
            $table->timestamps();

            $table->index('problema_principal');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_profiles');
    }
};
