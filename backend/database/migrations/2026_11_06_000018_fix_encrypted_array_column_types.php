<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Corrige também instalações que já executaram as migrações antigas.
        Schema::table('users', function (Blueprint $table) {
            $table->text('two_factor_recovery_codes')->nullable()->change();
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->text('shipping_address')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Mantém TEXT: os casts existentes exigem texto cifrado. Restaurar JSON aqui
        // rejeitaria os valores cifrados. As migrações de origem cuidam da reversão
        // do recurso (endereços decifrados ou remoção das colunas de MFA).
    }
};
