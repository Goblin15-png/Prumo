<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class EncryptedArrayStorageTest extends TestCase
{
    use RefreshDatabase;

    public function test_recovery_codes_and_shipping_address_round_trip_as_ciphertext_in_text_columns(): void
    {
        $user = User::factory()->create();
        $codes = ['recovery-test-only-1', 'recovery-test-only-2'];
        $user->forceFill(['two_factor_recovery_codes' => $codes])->save();
        $address = ['street' => 'Rua fictícia de teste', 'number' => '123'];
        $order = Order::create([
            'user_id' => $user->id,
            'order_number' => 'PC-TEST1234567890',
            'total_price' => 10,
            'status' => 'pending',
            'payment_method' => 'pix',
            'shipping_address' => $address,
        ]);

        $this->assertSame('text', Schema::getColumnType('users', 'two_factor_recovery_codes'));
        $this->assertSame('text', Schema::getColumnType('orders', 'shipping_address'));
        $this->assertSame($codes, $user->fresh()->two_factor_recovery_codes);
        $this->assertSame($address, $order->fresh()->shipping_address);
        $storedCodes = DB::table('users')->where('id', $user->id)->value('two_factor_recovery_codes');
        $storedAddress = DB::table('orders')->where('id', $order->id)->value('shipping_address');
        $this->assertStringNotContainsString($codes[0], $storedCodes);
        $this->assertStringNotContainsString($address['street'], $storedAddress);
        $this->assertNull(json_decode($storedCodes, true));
        $this->assertNull(json_decode($storedAddress, true));
    }
}
