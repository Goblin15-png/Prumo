<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email_code_hash')->nullable();
            $table->timestamp('email_code_expires_at')->nullable();
            $table->timestamp('email_code_sent_at')->nullable();
            $table->unsignedSmallInteger('email_code_attempts')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn([
            'email_code_hash', 'email_code_expires_at', 'email_code_sent_at', 'email_code_attempts',
        ]));
    }
};
