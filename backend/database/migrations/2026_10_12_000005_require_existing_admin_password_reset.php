<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('password_reset_required')->default(false);
        });

        $adminIds = DB::table('users')->where('role', 'admin')->pluck('id');
        DB::table('users')->whereIn('id', $adminIds)->update(['password_reset_required' => true]);

        if (Schema::hasTable('sessions')) {
            DB::table('sessions')->whereIn('user_id', $adminIds)->delete();
        }

        if (Schema::hasTable('personal_access_tokens')) {
            DB::table('personal_access_tokens')
                ->where('tokenable_type', 'App\\Models\\User')
                ->whereIn('tokenable_id', $adminIds)
                ->delete();
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_reset_required');
        });
    }
};
