<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DistributorWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    private function distributor(): User
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->forceFill(['is_distributor' => true])->save();

        return $user;
    }

    private function owner(string $profile = 'owner'): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->forceFill(['admin_profile' => $profile])->save();
        $this->actingAs($user, 'admin')->withAdminSession([
            'admin_mfa_confirmed_user_id' => $user->id,
            'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => $profile,
            'admin_mfa_confirmed_at' => now()->getTimestamp(),
        ]);

        return $user;
    }

    public function test_inventory_and_plans_are_private_and_do_not_create_orders(): void
    {
        $first = $this->distributor();
        $other = $this->distributor();
        $product = Product::create(['name' => 'Blend fictício', 'slug' => 'blend-ficticio', 'price' => 10, 'stock' => 7, 'is_active' => true]);
        $item = $this->actingAs($first)->postJson('/api/v1/distributor/inventory', [
            'product_id' => $product->id, 'quantity' => 4, 'minimum_quantity' => 6,
        ])->assertCreated()->json('item.id');
        $plan = $this->postJson('/api/v1/distributor/plans', [
            'product_id' => $product->id, 'quantity' => 24, 'planned_date' => '2026-11-15', 'notes' => 'Exemplo',
        ])->assertCreated()->json('item.id');
        $this->getJson('/api/v1/distributor/workspace')->assertOk()->assertJsonCount(1, 'inventory')->assertJsonCount(1, 'plans');
        $this->actingAs($other)->getJson('/api/v1/distributor/workspace')->assertJsonCount(0, 'inventory')->assertJsonCount(0, 'plans');
        $this->putJson('/api/v1/distributor/inventory/'.$item, ['product_id' => $product->id, 'quantity' => 99, 'minimum_quantity' => 1])->assertNotFound();
        $this->deleteJson('/api/v1/distributor/plans/'.$plan)->assertNotFound();
        $this->actingAs($first)->putJson('/api/v1/distributor/inventory/'.$item, ['product_id' => $product->id, 'quantity' => 8, 'minimum_quantity' => 6])->assertOk();
        $this->deleteJson('/api/v1/distributor/inventory/'.$item)->assertNoContent();
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('products', 1);
        $this->assertSame(7, $product->fresh()->stock);
    }

    public function test_validation_rejects_negative_stock_fractional_quantities_and_invalid_dates(): void
    {
        $this->actingAs($this->distributor());
        $product = Product::create(['name' => 'Teste', 'slug' => 'teste', 'price' => 10, 'is_active' => true]);
        $this->postJson('/api/v1/distributor/inventory', ['product_id' => $product->id, 'quantity' => -1, 'minimum_quantity' => 0])->assertUnprocessable();
        $this->postJson('/api/v1/distributor/inventory', ['product_id' => $product->id, 'quantity' => 1.5, 'minimum_quantity' => 0])->assertUnprocessable();
        $this->postJson('/api/v1/distributor/plans', ['product_id' => $product->id, 'quantity' => 0, 'planned_date' => 'amanhã'])->assertUnprocessable();
        $this->postJson('/api/v1/distributor/support', ['subject' => 'Teste', 'body' => str_repeat('a', 4001)])->assertUnprocessable();
        $this->assertDatabaseCount('distributor_inventory', 0);
        $this->assertDatabaseCount('support_tickets', 0);
    }

    public function test_support_is_private_and_distributor_cannot_claim_admin_authorship(): void
    {
        $first = $this->distributor();
        $other = $this->distributor();
        $id = $this->actingAs($first)->postJson('/api/v1/distributor/support', [
            'subject' => 'Reposição fictícia', 'body' => 'Olá', 'from_admin' => true, 'user_id' => $other->id,
        ])->assertCreated()->json('id');
        $this->getJson('/api/v1/distributor/support/'.$id)->assertOk()->assertJsonPath('messages.0.from_admin', 0);
        $this->actingAs($other)->getJson('/api/v1/distributor/support/'.$id)->assertNotFound();
        $this->postJson('/api/v1/distributor/support/'.$id.'/messages', ['body' => 'Outra pessoa'])->assertNotFound();
        $this->getJson('/api/v1/distributor/support')->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('support_messages', 1);
        $this->assertDatabaseHas('support_tickets', ['id' => $id, 'user_id' => $first->id]);
    }

    public function test_owner_can_reply_close_and_reopen_with_audit(): void
    {
        $distributor = $this->distributor();
        $id = $this->actingAs($distributor)->postJson('/api/v1/distributor/support', ['subject' => 'Teste', 'body' => 'Olá'])->json('id');
        $owner = $this->owner();
        $this->getJson('/api/v1/admin/support')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/v1/admin/support/'.$id.'/messages', ['body' => 'Resposta'])->assertNoContent();
        $this->patchJson('/api/v1/admin/support/'.$id.'/status', ['status' => 'closed'])->assertNoContent();
        $this->postJson('/api/v1/admin/support/'.$id.'/messages', ['body' => 'Não enviar'])->assertUnprocessable();
        $this->assertDatabaseCount('support_messages', 2);
        $this->patchJson('/api/v1/admin/support/'.$id.'/status', ['status' => 'open'])->assertNoContent();
        $this->assertDatabaseHas('support_messages', ['ticket_id' => $id, 'user_id' => $owner->id, 'from_admin' => true]);
        $this->assertSame(3, DB::table('security_audit_logs')->where('admin_user_id', $owner->id)->count());
        $this->actingAs($distributor)->postJson('/api/v1/distributor/support/'.$id.'/messages', ['body' => 'Obrigada'])->assertNoContent();
    }

    public function test_customer_and_technical_admin_are_denied(): void
    {
        $this->getJson('/api/v1/distributor/workspace')->assertUnauthorized();
        $this->actingAs(User::factory()->create(['role' => 'customer']))->getJson('/api/v1/distributor/workspace')->assertForbidden();
        $this->postJson('/api/v1/distributor/support', ['subject' => 'Teste', 'body' => 'Teste'])->assertForbidden();
        $this->owner('technical');
        $this->getJson('/api/v1/admin/support')->assertForbidden();
        $this->postJson('/api/v1/admin/support/1/messages', ['body' => 'Teste'])->assertForbidden();
        $this->patchJson('/api/v1/admin/support/1/status', ['status' => 'closed'])->assertForbidden();
    }
    public function test_only_active_catalog_blends_can_be_selected_and_server_sets_the_name(): void
    {
        $this->actingAs($this->distributor());
        $active = Product::create(['name' => 'Blend do admin', 'slug' => 'blend-admin', 'price' => 10, 'stock' => 0, 'is_active' => true]);
        $inactive = Product::create(['name' => 'Inativo', 'slug' => 'inativo', 'price' => 10, 'is_active' => false]);
        $this->getJson('/api/v1/distributor/workspace')->assertOk()
            ->assertJsonCount(1, 'products')->assertJsonPath('products.0.id', $active->id);
        $id = $this->postJson('/api/v1/distributor/inventory', [
            'product_id' => $active->id, 'product_name' => 'Nome adulterado', 'quantity' => 3, 'minimum_quantity' => 1,
        ])->assertCreated()->assertJsonPath('item.product_name', 'Blend do admin')->json('item.id');
        foreach ([$inactive->id, 99999, null] as $invalid) {
            $this->postJson('/api/v1/distributor/plans', [
                'product_id' => $invalid, 'quantity' => 1, 'planned_date' => '2026-11-15',
            ])->assertUnprocessable()->assertJsonValidationErrors('product_id');
        }
        $active->delete();
        $this->assertDatabaseHas('distributor_inventory', ['id' => $id, 'product_id' => null, 'product_name' => 'Blend do admin']);
    }

}
