<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\Symptom;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminCommerceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 14));
        $admin = User::create(['name' => 'Proprietário fictício', 'email' => 'owner@example.test', 'password' => 'long-test-password', 'role' => 'admin']);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $this->actingAs($admin, 'admin');
        $this->withHeader('Origin', 'http://localhost:3000')->withAdminSession([
            'admin_mfa_confirmed_user_id' => $admin->id, 'admin_mfa_confirmed_profile' => 'owner',
            'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_at' => now()->getTimestamp(),
        ]);
    }

    private function product(string $slug): Product
    {
        return Product::create(['name' => 'Blend '.$slug, 'slug' => $slug, 'stock' => 5, 'price' => 49.9]);
    }

    private function profile(int $index, array $extra = []): User
    {
        $user = User::create(['name' => 'Pessoa fictícia '.$index, 'email' => 'customer'.$index.'@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $user->profile()->create(array_merge([
            'sexo' => 'Feminino', 'data_nascimento' => '1996-05-01', 'canal_aquisicao' => 'Instagram',
            'problema_principal' => 'Queixa A', 'health_data_consented_at' => now(), 'health_data_consent_version' => '2026-10-v1',
        ], $extra));

        return $user;
    }

    public function test_category_assignment_is_additive_idempotent_and_order_is_independent(): void
    {
        $a = Category::create(['name' => 'Categoria A', 'slug' => 'a']);
        $b = Category::create(['name' => 'Categoria B', 'slug' => 'b']);
        $first = $this->product('primeiro');
        $second = $this->product('segundo');
        foreach ([$a, $b, $b] as $category) {
            $this->postJson('/api/v1/admin/categories/'.$category->id.'/products', ['product_ids' => [$first->id, $second->id]])->assertOk();
        }
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $first->categories()->pluck('categories.id')->all());
        $this->assertDatabaseCount('category_product', 4);
        $this->putJson('/api/v1/admin/categories/'.$a->id.'/products/order', ['product_ids' => [$second->id, $first->id]])->assertOk();
        $this->assertSame([$second->id, $first->id], $a->products()->pluck('products.id')->all());
        $this->assertSame([$first->id, $second->id], $b->products()->pluck('products.id')->all());
        foreach (['a', 'b'] as $slug) {
            $this->getJson('/api/v1/products?category='.$slug)->assertOk()->assertJsonCount(2, 'data')->assertJsonCount(2, 'data.0.categories')->assertJsonPath('data.0.id', $slug === 'a' ? $second->id : $first->id);
        }
        $this->deleteJson('/api/v1/admin/categories/'.$a->id.'/products/'.$first->id)->assertOk();
        $this->assertSame([$b->id], $first->categories()->pluck('categories.id')->all());
        $this->assertSame($b->id, $first->fresh()->category_id);
        $this->deleteJson('/api/v1/admin/categories/'.$a->id)->assertOk();
        $this->assertSame([$b->id], $second->categories()->pluck('categories.id')->all());
        $this->assertDatabaseCount('products', 2);
        $this->deleteJson('/api/v1/admin/products/'.$first->id)->assertOk();
        $this->assertDatabaseMissing('category_product', ['product_id' => $first->id]);
        $this->assertDatabaseHas('categories', ['id' => $b->id]);
    }

    public function test_editing_and_deleting_product_preserves_historical_order_items(): void
    {
        $customer = User::create(['name' => 'Cliente fictício', 'email' => 'history@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $product = $this->product('historico');
        $order = Order::create(['user_id' => $customer->id, 'order_number' => 'PC-HISTORY-1', 'total_price' => 49.9, 'payment_method' => 'pix', 'status' => 'paid']);
        $item = $order->items()->create(['product_id' => $product->id, 'product_name' => $product->name, 'unit_price' => 49.9, 'quantity' => 1, 'subtotal' => 49.9]);
        $ingredient = $this->postJson('/api/v1/admin/ingredients', ['name' => 'Novo ingrediente fictício'])->assertCreated()->json('ingredient.id');
        $this->putJson('/api/v1/admin/products/'.$product->id, [
            'name' => 'Blend atualizado', 'price' => 59.9, 'stock' => 4,
            'images' => ['https://example.invalid/capa.png', 'https://example.invalid/segunda.png'],
            'ingredients' => [['id' => $ingredient, 'percentage' => '25%']],
        ])->assertOk()->assertJsonPath('product.images.0', 'https://example.invalid/capa.png')->assertJsonPath('product.ingredients.0.id', $ingredient);
        $this->assertSame($product->name, $item->fresh()->product_name);
        $this->deleteJson('/api/v1/admin/products/'.$product->id)->assertOk();
        $this->assertNull($item->fresh()->product_id);
        $this->assertSame($product->name, $item->fresh()->product_name);
        $this->assertSame('49.90', $item->fresh()->unit_price);
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame('49.90', $order->fresh()->total_price);
    }

    public function test_registered_complaint_is_available_to_customer_as_one_principal_and_to_product_as_target(): void
    {
        Category::create(['name' => 'Categoria de organização', 'slug' => 'organizacao']);
        $symptom = $this->postJson('/api/v1/admin/symptoms', ['name' => 'Ansiedade fictícia'])->assertCreated()->json('symptom');
        $this->getJson('/api/v1/symptoms')->assertOk()->assertJsonFragment(['name' => 'Ansiedade fictícia'])->assertJsonMissing(['name' => 'Categoria de organização']);
        $productId = $this->postJson('/api/v1/admin/products', ['name' => 'Blend de teste', 'price' => 49.9, 'stock' => 3, 'symptom_ids' => [$symptom['id']]])->assertCreated()->json('product.id');
        $customer = User::create(['name' => 'Cliente fictício', 'email' => 'complaint@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $customer->markEmailAsVerified();
        Sanctum::actingAs($customer);
        $this->postJson('/api/v1/user/profile', ['sexo' => 'Prefiro não dizer', 'problema_principal' => $symptom['name'], 'health_data_consent' => true])
            ->assertOk()->assertJsonPath('profile.problema_principal', $symptom['name'])->assertJsonPath('recommendations.0.id', $productId);
        $this->postJson('/api/v1/user/profile', ['sexo' => 'Prefiro não dizer', 'problema_principal' => [$symptom['name'], 'Outra queixa'], 'health_data_consent' => true])
            ->assertUnprocessable()->assertJsonValidationErrors('problema_principal');
        $this->assertSame($symptom['name'], $customer->profile()->firstOrFail()->problema_principal);
    }

    public function test_category_migration_preserves_legacy_association_and_position(): void
    {
        $migration = require database_path('migrations/2026_10_14_000014_create_category_product_table.php');
        $migration->down();
        $category = Category::create(['name' => 'Legado', 'slug' => 'legado']);
        $product = $this->product('legado');
        $product->update(['category_id' => $category->id, 'category_position' => 7]);
        $migration->up();
        $this->assertDatabaseHas('category_product', ['category_id' => $category->id, 'product_id' => $product->id, 'sort_order' => 7]);
    }

    public function test_owner_can_create_ingredients_and_complaints_and_cannot_assign_category_arrays_in_product_form(): void
    {
        $this->postJson('/api/v1/admin/ingredients', ['name' => ' Ingrediente fictício ', 'benefits' => 'Descrição fictícia'])->assertCreated()->assertJsonPath('ingredient.name', 'Ingrediente fictício');
        $this->postJson('/api/v1/admin/ingredients', ['name' => 'Ingrediente fictício'])->assertUnprocessable();
        $this->postJson('/api/v1/admin/symptoms', ['name' => 'Queixa fictícia'])->assertCreated();
        $category = Category::create(['name' => 'Categoria A', 'slug' => 'a']);
        $this->postJson('/api/v1/admin/products', ['name' => 'Blend', 'stock' => 3, 'price' => 10, 'category_ids' => [$category->id]])->assertUnprocessable()->assertJsonValidationErrors('category_ids');
    }

    public function test_audience_report_and_andromeda_use_same_consented_aggregates_without_personal_fields(): void
    {
        Symptom::create(['name' => 'Queixa A']);
        Symptom::create(['name' => 'Queixa B']);
        foreach (range(1, 5) as $index) {
            $this->profile($index);
        }
        foreach (range(6, 10) as $index) {
            $this->profile($index, ['sexo' => 'Masculino', 'data_nascimento' => '1976-05-01', 'canal_aquisicao' => 'Pesquisa no Google', 'problema_principal' => 'Queixa B']);
        }
        foreach (range(11, 14) as $index) {
            $this->profile($index, ['sexo' => 'Outro', 'canal_aquisicao' => 'TikTok', 'problema_principal' => 'Texto privado não cadastrado']);
        }
        $this->profile(15, ['health_data_consented_at' => null, 'problema_principal' => 'Queixa sem consentimento']);
        $report = $this->getJson('/api/v1/admin/health-metrics')->assertOk()->assertJsonPath('total_clients_analyzed', 14)->json();
        $this->assertContains(['label' => 'Instagram', 'count' => 5, 'percentage' => 35.7], $report['audience']['acquisition']);
        $this->assertContains(['label' => '25–34', 'count' => 9, 'percentage' => 64.3], $report['audience']['age']);
        $this->assertNotContains('TikTok', array_column($report['audience']['acquisition'], 'label'));
        $this->assertContains(['dimension' => 'gender', 'label' => 'Feminino', 'complaint' => 'Queixa A', 'count' => 5], $report['complaint_by_audience']);
        $this->assertStringNotContainsString('Texto privado', json_encode($report));
        config(['services.gemini.key' => 'test-only', 'services.gemini.model' => 'gemini-test']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => '{"marketing_content_ideas":[]}']]]]]])]);
        $this->getJson('/api/v1/admin/ai-insights')->assertOk()->assertJsonPath('total_profiles_analyzed', 14);
        Http::assertSent(function ($request) use ($report) {
            $text = $request['contents'][0]['parts'][0]['text'];
            $payload = json_decode(substr($text, strpos($text, '{')), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame($report['audience'], $payload['audience']);
            $this->assertSame($report['complaint_by_audience'], $payload['complaint_by_audience']);
            foreach (['customer1@example.test', '1996-05-01', 'Texto privado', 'sem consentimento', 'Pessoa fictícia'] as $private) {
                $this->assertStringNotContainsString($private, $text);
            }

            return true;
        });
    }

    public function test_audience_counts_each_account_once_and_respects_latest_consent(): void
    {
        Symptom::create(['name' => 'Queixa A']);
        foreach (range(1, 5) as $index) {
            $user = $this->profile($index);
            UserProfile::create(['user_id' => $user->id, 'sexo' => 'Masculino', 'problema_principal' => 'Queixa A', 'health_data_consented_at' => now()]);
        }
        $this->getJson('/api/v1/admin/health-metrics')->assertOk()->assertJsonPath('total_clients_analyzed', 5)->assertJsonPath('symptoms_distribution.0.count', 5);
        UserProfile::create(['user_id' => $user->id, 'sexo' => 'Masculino', 'problema_principal' => 'Queixa A']);
        $this->getJson('/api/v1/admin/health-metrics')->assertOk()->assertJsonPath('total_clients_analyzed', 4)->assertJsonCount(0, 'symptoms_distribution');
    }

    public function test_small_cross_groups_stay_hidden_even_with_large_overall_complaint_count(): void
    {
        Symptom::create(['name' => 'Queixa A']);
        foreach (range(1, 5) as $index) {
            $this->profile($index);
        }
        foreach (range(6, 9) as $index) {
            $this->profile($index, ['sexo' => 'Masculino', 'canal_aquisicao' => 'TikTok']);
        }
        $report = $this->getJson('/api/v1/admin/health-metrics')->assertOk()->assertJsonPath('symptoms_distribution.0.count', 9)->json();
        foreach ($report['complaint_by_audience'] as $row) {
            $this->assertGreaterThanOrEqual(5, $row['count']);
        }
        $this->assertNotContains('TikTok', array_column($report['complaint_by_audience'], 'label'));
    }

    public function test_order_filters_pagination_and_tracking_do_not_allow_manual_payment_confirmation(): void
    {
        $customer = User::create(['name' => 'Comprador fictício', 'email' => 'buyer@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $paid = null;
        foreach (range(1, 26) as $index) {
            $order = Order::create(['user_id' => $customer->id, 'order_number' => 'PC-TEST-'.$index, 'total_price' => 49.9, 'payment_method' => 'pix', 'status' => $index === 1 ? 'paid' : 'shipped']);
            if ($index === 1) {
                $paid = $order;
            }
        }
        $pending = Order::create(['user_id' => $customer->id, 'order_number' => 'PC-PENDING', 'total_price' => 49.9, 'payment_method' => 'pix', 'status' => 'pending']);
        Order::create(['user_id' => $customer->id, 'order_number' => 'PC-CANCELLED', 'total_price' => 49.9, 'payment_method' => 'pix', 'status' => 'cancelled']);
        $this->getJson('/api/v1/admin/orders')->assertOk()->assertJsonCount(25, 'data')->assertJsonPath('meta.total', 26)->assertJsonPath('meta.last_page', 2);
        $this->getJson('/api/v1/admin/orders?page=2')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/orders?status=paid&search=buyer')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $paid->id);
        $this->getJson('/api/v1/admin/orders?status=paid&search=inexistente')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/orders?status=pending')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 0);
        $this->getJson('/api/v1/admin/orders?status=cancelled')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/orders?search=PC-PENDING')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/orders?status=invalid')->assertUnprocessable();
        $this->getJson('/api/v1/admin/orders?search='.str_repeat('a', 121))->assertUnprocessable();
        $this->patchJson('/api/v1/admin/orders/'.$pending->id.'/shipment', ['tracking_code' => 'FICTICIO'])->assertUnprocessable();
        $this->assertSame('pending', $pending->fresh()->status);
        $this->patchJson('/api/v1/admin/orders/'.$paid->id.'/shipment', ['tracking_code' => 'FICTICIO'])->assertOk();
        $this->assertSame('shipped', $paid->fresh()->status);
        $this->assertDatabaseHas('security_audit_logs', ['method' => 'PATCH', 'route' => 'api/v1/admin/orders/{id}/shipment']);
    }

    public function test_customer_only_sees_own_paid_orders_and_payment_attempts_remain_internal(): void
    {
        $customer = User::create(['name' => 'Cliente fictício', 'email' => 'paid-buyer@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $customer->forceFill(['email_verified_at' => now()])->save();
        $orders = [];
        foreach (['pending', 'paid', 'shipped', 'cancelled'] as $index => $status) {
            $orders[$status] = Order::create(['user_id' => $customer->id, 'order_number' => 'PC-'.str_repeat((string) ($index + 1), 14), 'total_price' => 49.9, 'payment_method' => 'pix', 'status' => $status]);
        }
        $other = User::create(['name' => 'Outro cliente', 'email' => 'other-paid-buyer@example.test', 'password' => 'long-test-password', 'role' => 'customer']);
        $foreignOrder = Order::create(['user_id' => $other->id, 'order_number' => 'PC-'.str_repeat('5', 14), 'total_price' => 49.9, 'payment_method' => 'pix', 'status' => 'paid']);
        Sanctum::actingAs($customer);
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonMissing(['order_number' => $orders['pending']->order_number])
            ->assertJsonMissing(['order_number' => $foreignOrder->order_number]);
        $this->getJson('/api/v1/orders/'.$orders['pending']->order_number)->assertNotFound();
        $this->getJson('/api/v1/orders/'.$orders['cancelled']->order_number)->assertNotFound();
        $this->getJson('/api/v1/orders/'.$foreignOrder->order_number)->assertNotFound();
        $this->getJson('/api/v1/orders/'.$orders['paid']->order_number)->assertOk();
        $this->assertDatabaseHas('orders', ['id' => $orders['pending']->id, 'status' => 'pending']);
        // Simula a confirmação confiável no servidor, sem endpoint de confirmação manual.
        $orders['pending']->update(['status' => 'paid', 'payment_status' => 'approved']);
        $this->getJson('/api/v1/orders')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/v1/orders/'.$orders['pending']->order_number)->assertOk();
    }
}
