<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('fulfillment_method', 20)->default('delivery');
            $table->string('fulfillment_status', 30)->nullable();
            $table->unsignedInteger('fulfillment_revision')->default(0);
            $table->index(['fulfillment_status', 'id']);
        });
        Schema::create('order_fulfillment_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('admin_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 30);
            $table->string('to_status', 30);
            $table->string('from_tracking_code', 100)->nullable();
            $table->string('to_tracking_code', 100)->nullable();
            $table->unsignedInteger('revision');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['order_id', 'revision']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_fulfillment_events');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['fulfillment_status', 'id']);
            $table->dropColumn(['fulfillment_method', 'fulfillment_status', 'fulfillment_revision']);
        });
    }
};
