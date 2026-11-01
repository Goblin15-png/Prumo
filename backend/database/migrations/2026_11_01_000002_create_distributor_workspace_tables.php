<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('distributor_inventory', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('product_name', 150);
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('minimum_quantity')->default(0);
            $table->timestamps();
        });
        Schema::create('distributor_purchase_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('product_name', 150);
            $table->unsignedInteger('quantity');
            $table->date('planned_date');
            $table->string('notes', 1000)->nullable();
            $table->timestamps();
        });
        Schema::create('support_tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('subject', 150);
            $table->string('status', 20)->default('open');
            $table->timestamps();
            $table->index(['status', 'updated_at']);
        });
        Schema::create('support_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('support_tickets')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('from_admin')->default(false);
            $table->text('body');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_messages');
        Schema::dropIfExists('support_tickets');
        Schema::dropIfExists('distributor_purchase_plans');
        Schema::dropIfExists('distributor_inventory');
    }
};
