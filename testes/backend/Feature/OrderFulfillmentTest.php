<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\OrderFulfillmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderFulfillmentTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $customer;

    private int $sequence = 0;

    private array $providerPayments = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 14));
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            $payment = $this->providerPayments[$request->url()] ?? null;

            return $payment ? Http::response($payment) : null;
        });
        $this->owner = User::create(['name' => 'Proprietário fictício', 'email' => 'fulfillment-owner@example.test', 'password' => 'long-test-password', 'role' => 'admin']);
        $this->owner->forceFill(['admin_profile' => 'owner'])->save();
        $this->customer = User::create(['name' => 'Cliente fictício', 'email' => 'fulfillment-customer@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $this->customer->forceFill(['email_verified_at' => now()])->save();
        $this->actingAs($this->owner, 'admin');
        $this->withHeader('Origin', 'http://localhost:3000')->withAdminSession([
            'admin_mfa_confirmed_user_id' => $this->owner->id,
            'admin_mfa_confirmed_profile' => 'owner', 'admin_mfa_access_version' => 0,
            'admin_mfa_confirmed_at' => now()->getTimestamp(),
        ]);
    }

    private function order(array $extra = []): Order
    {
        $number = ++$this->sequence;
        $product = Product::create(['name' => 'Blend fictício', 'slug' => 'fulfillment-'.$number, 'price' => 49.9, 'stock' => 4, 'is_active' => true]);
        $order = Order::create(array_merge([
            'user_id' => $this->customer->id, 'order_number' => 'PC-'.str_pad((string) $number, 14, '0', STR_PAD_LEFT),
            'status' => 'paid', 'payment_status' => 'approved', 'payment_method' => 'pix',
            'payment_preference_id' => 'preference-'.$number, 'total_price' => 49.9,
            'stock_reserved' => true, 'shipping_cost' => 0,
        ], $extra));
        $order->items()->create(['product_id' => $product->id, 'product_name' => $product->name, 'unit_price' => 49.9, 'quantity' => 1, 'subtotal' => 49.9]);

        return $order->fresh();
    }

    private function setStatus(Order $order, string $status, ?int $revision = null, array $extra = [])
    {
        return $this->patchJson('/api/v1/admin/orders/'.$order->id.'/fulfillment', array_merge([
            'fulfillment_status' => $status, 'expected_revision' => $revision ?? $order->fresh()->fulfillment_revision,
        ], $extra));
    }

    public function test_owner_persists_direct_status_and_customer_reads_it_without_internal_history(): void
    {
        $order = $this->order();
        $this->setStatus($order, 'delivered')->assertOk()->assertJsonPath('data.fulfillment_status', 'delivered')->assertJsonPath('data.fulfillment_revision', 1);
        $this->setStatus($order, 'preparing')->assertOk()->assertJsonPath('data.fulfillment_status', 'preparing')->assertJsonPath('data.fulfillment_revision', 2);
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame('approved', $order->fresh()->payment_status);
        $this->assertTrue($order->fresh()->stock_reserved);
        $this->assertSame(4, $order->items->first()->product->fresh()->stock);
        $this->assertDatabaseHas('order_fulfillment_events', ['order_id' => $order->id, 'admin_user_id' => $this->owner->id, 'from_status' => 'delivered', 'to_status' => 'preparing', 'revision' => 2]);
        $this->getJson('/api/v1/admin/orders?fulfillment_stage=preparing')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.fulfillment_history.1.actor', $this->owner->name);
        $this->assertDatabaseHas('security_audit_logs', ['route' => 'api/v1/admin/orders/{id}/fulfillment', 'method' => 'PATCH']);
        Sanctum::actingAs($this->customer);
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonPath('data.0.fulfillment_status', 'preparing')->assertJsonMissingPath('data.0.fulfillment_history')->assertJsonMissingPath('data.0.fulfillment_allowed_statuses');
        $this->getJson('/api/v1/orders/'.$order->order_number)->assertOk()->assertJsonPath('data.fulfillment_status', 'preparing');
    }

    public function test_pickup_has_its_own_statuses_and_client_cannot_change_modality_or_finances(): void
    {
        $order = $this->order();
        $order->forceFill(['fulfillment_method' => 'pickup'])->save();
        $this->setStatus($order, 'collected')->assertOk()->assertJsonPath('data.fulfillment_method', 'pickup')->assertJsonPath('data.fulfillment_status', 'collected');
        $this->setStatus($order, 'confirmed')->assertOk();
        $this->setStatus($order, 'shipped')->assertUnprocessable();
        $this->setStatus($order, 'preparing', extra: ['fulfillment_method' => 'delivery'])->assertUnprocessable();
        foreach (['status' => 'paid', 'payment_status' => 'approved', 'total_price' => 1, 'stock_reserved' => false, 'admin_user_id' => $this->customer->id] as $field => $value) {
            $this->setStatus($order, 'preparing', extra: [$field => $value])->assertUnprocessable();
        }
        $this->setStatus($order, 'paid')->assertUnprocessable();
        $delivery = $this->order();
        $this->setStatus($delivery, 'ready_for_pickup')->assertUnprocessable();
        $this->assertSame('pickup', $order->fresh()->fulfillment_method);
        $this->assertSame('49.90', $order->fresh()->total_price);
        $order->fill(['fulfillment_status' => 'shipped', 'fulfillment_revision' => 100, 'fulfillment_method' => 'delivery'])->save();
        $this->assertSame('confirmed', $order->fresh()->fulfillment_status);
        $this->assertSame('pickup', $order->fresh()->fulfillment_method);
    }

    public function test_payment_inventory_authentication_and_operation_permission_are_enforced(): void
    {
        foreach ([['status' => 'pending', 'payment_status' => 'pending'], ['status' => 'cancelled'], ['payment_status' => 'refunded'], ['inventory_issue' => true]] as $extra) {
            $order = $this->order($extra);
            $this->setStatus($order, 'preparing')->assertUnprocessable();
            $this->assertNull($order->fresh()->fulfillment_status);
        }
        $order = $this->order();
        Gate::define('orders.fulfillment.update', fn () => false);
        $this->setStatus($order, 'preparing')->assertForbidden();
        Gate::define('orders.fulfillment.update', fn (User $user) => $user->id === $this->owner->id);
        $this->app['auth']->guard('admin')->forgetUser();
        Sanctum::actingAs($this->customer);
        $this->setStatus($order, 'preparing')->assertUnauthorized();
        $this->assertDatabaseCount('order_fulfillment_events', 0);
        $this->actingAs($this->owner, 'admin');
        $this->withAdminSession(['admin_mfa_confirmed_at' => null]);
        $this->setStatus($order, 'preparing')->assertForbidden();
    }

    public function test_revision_noop_tracking_and_legacy_orders_are_consistent(): void
    {
        $order = $this->order();
        $this->patchJson('/api/v1/admin/orders/'.$order->id.'/fulfillment', ['fulfillment_status' => 'shipped'])->assertUnprocessable();
        $this->setStatus($order, 'shipped', 0, ['tracking_code' => 'FICTICIO'])->assertOk();
        $this->setStatus($order, 'preparing', 0)->assertConflict();
        $this->setStatus($order, 'shipped', 1, ['tracking_code' => 'FICTICIO'])->assertOk()->assertJsonPath('data.fulfillment_revision', 1);
        $this->setStatus($order, 'confirmed', 1)->assertOk()->assertJsonPath('data.tracking_code', null);
        $this->assertDatabaseHas('order_fulfillment_events', ['order_id' => $order->id, 'from_tracking_code' => 'FICTICIO', 'revision' => 2]);
        $this->assertDatabaseCount('order_fulfillment_events', 2);
        $this->setStatus($order, 'shipped', 0)->assertConflict();
        $legacy = $this->order(['status' => 'shipped', 'tracking_code' => 'LEGADO']);
        $this->getJson('/api/v1/admin/orders?fulfillment_stage=shipped')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $legacy->id)->assertJsonPath('data.0.fulfillment_status', 'shipped');
        $this->getJson('/api/v1/admin/orders?fulfillment_stage=confirmed')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/orders?fulfillment_stage=invalid')->assertUnprocessable();
        $this->setStatus($order, 'shipped', extra: ['tracking_code' => str_repeat('a', 101)])->assertUnprocessable();
    }

    public function test_legacy_tracking_uses_history_and_does_not_downgrade_delivered_order(): void
    {
        $order = $this->order();
        $this->patchJson('/api/v1/admin/orders/'.$order->id.'/shipment', ['tracking_code' => 'FICTICIO'])->assertOk();
        $this->assertSame('shipped', $order->fresh()->fulfillment_status);
        $this->assertSame('shipped', $order->fresh()->status);
        $this->setStatus($order, 'delivered')->assertOk();
        $this->patchJson('/api/v1/admin/orders/'.$order->id.'/shipment', ['tracking_code' => 'CORRIGIDO'])->assertOk();
        $this->assertSame('delivered', $order->fresh()->fulfillment_status);
        $this->assertSame(3, $order->fresh()->fulfillment_revision);
        $this->assertSame(4, $order->items->first()->product->fresh()->stock);
        $this->assertDatabaseCount('order_fulfillment_events', 3);
    }

    public function test_failure_in_either_audit_rolls_back_order_and_events(): void
    {
        $order = $this->order();
        foreach (['order_fulfillment_events', 'security_audit_logs'] as $table) {
            DB::unprepared("CREATE TRIGGER fail_fulfillment_audit BEFORE INSERT ON {$table} BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
            $this->setStatus($order, 'delivered')->assertStatus(503);
            $this->assertSame(0, $order->fresh()->fulfillment_revision);
            $this->assertNull($order->fresh()->fulfillment_status);
            $this->assertDatabaseCount('order_fulfillment_events', 0);
            DB::unprepared('DROP TRIGGER fail_fulfillment_audit');
        }
    }

    private function webhook(Order $order, string $status, string $event): void
    {
        $id = (string) (70000 + $order->id);
        config(['services.mercado_pago.access_token' => 'test-token', 'services.mercado_pago.webhook_secret' => 'test-secret']);
        $this->providerPayments['https://api.mercadopago.com/v1/payments/'.$id] = [
            'id' => (int) $id, 'status' => $status, 'external_reference' => $order->order_number,
            'transaction_amount' => 49.9, 'currency_id' => 'BRL', 'preference_id' => $order->payment_preference_id,
            'payment_method_id' => 'pix', 'payment_type_id' => 'bank_transfer',
        ];
        $timestamp = (string) now()->timestamp;
        $signature = 'ts='.$timestamp.',v1='.hash_hmac('sha256', 'id:'.$id.';request-id:'.$event.';ts:'.$timestamp.';', 'test-secret');
        $this->withHeaders(['x-request-id' => $event, 'x-signature' => $signature])->postJson('/api/v1/payments/mercado-pago/webhook?type=payment&data_id='.$id, ['id' => $event, 'type' => 'payment', 'data' => ['id' => $id]])->assertOk();
    }

    public function test_payment_notifications_preserve_operational_status_and_do_not_restock_dispatched_items(): void
    {
        foreach (['shipped', 'delivered', 'collected'] as $status) {
            $order = $this->order();
            if ($status === 'collected') {
                $order->forceFill(['fulfillment_method' => 'pickup'])->save();
            }
            $this->setStatus($order, $status)->assertOk();
            $this->webhook($order, 'approved', 'approved-'.$status);
            $this->webhook($order, 'approved', 'approved-'.$status);
            $this->assertSame($status, $order->fresh()->fulfillment_status);
            $this->assertSame(1, $order->fresh()->fulfillment_revision);
            $this->assertSame(4, $order->items->first()->product->fresh()->stock);
            $this->webhook($order, 'refunded', 'refunded-'.$status);
            $this->assertSame('refunded', $order->fresh()->payment_status);
            $this->assertSame(4, $order->items->first()->product->fresh()->stock);
            $this->assertSame($status, $order->fresh()->fulfillment_status);
            $this->setStatus($order, 'preparing')->assertUnprocessable();
        }
        $unshipped = $this->order();
        $this->setStatus($unshipped, 'preparing')->assertOk();
        $this->webhook($unshipped, 'refunded', 'refunded-unshipped');
        $this->assertSame(5, $unshipped->items->first()->product->fresh()->stock);
        $this->assertSame('cancelled', $unshipped->fresh()->status);
    }

    public function test_admin_history_is_bounded_per_order_and_legacy_null_status_keeps_its_meaning(): void
    {
        $first = $this->order();
        $second = $this->order();
        $service = app(OrderFulfillmentService::class);
        foreach (range(0, 50) as $revision) {
            $service->update($first->id, $this->owner, ['fulfillment_status' => $revision % 2 === 0 ? 'preparing' : 'confirmed', 'expected_revision' => $revision]);
        }
        $this->setStatus($second, 'delivered')->assertOk();
        $result = $this->getJson('/api/v1/admin/orders')->assertOk()->json('data');
        $firstView = collect($result)->firstWhere('id', $first->id);
        $secondView = collect($result)->firstWhere('id', $second->id);
        $this->assertCount(50, $firstView['fulfillment_history']);
        $this->assertSame(2, $firstView['fulfillment_history'][0]['revision']);
        $this->assertCount(1, $secondView['fulfillment_history']);
        $this->assertSame('delivered', $secondView['fulfillment_status']);
    }
}
