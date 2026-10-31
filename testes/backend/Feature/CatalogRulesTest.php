<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Ingredient;
use App\Models\Product;
use App\Models\Symptom;
use App\Models\User;
use App\Services\RecommendationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CatalogRulesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = User::create(['name' => 'Proprietário teste', 'email' => 'owner@example.test', 'password' => 'a-long-test-password', 'role' => 'admin']);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $this->actingAs($admin, 'admin');
        $this->withHeader('Origin', 'http://localhost:3000')->withAdminSession([
            'admin_mfa_confirmed_user_id' => $admin->id,
            'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => 'owner',
            'admin_mfa_confirmed_at' => now()->getTimestamp(),
        ]);
    }

    private function payload(array $extra = []): array
    {
        return array_merge(['name' => 'Blend fictício', 'price' => 49.90, 'stock' => 8], $extra);
    }

    public function test_blend_accepts_multiple_complaints_and_ingredients_without_category(): void
    {
        $first = Symptom::create(['name' => 'Alvo A']);
        $second = Symptom::create(['name' => 'Alvo B']);
        $ingredient = Ingredient::create(['name' => 'Ingrediente fictício']);
        $response = $this->postJson('/api/v1/admin/products', $this->payload([
            'symptom_ids' => [$first->id, $second->id],
            'ingredients' => [['id' => $ingredient->id, 'percentage' => '10%']],
        ]))->assertCreated()->assertJsonCount(2, 'product.symptoms')->assertJsonPath('product.category_id', null);
        $product = Product::findOrFail($response->json('product.id'));
        $this->assertEqualsCanonicalizing([$first->id, $second->id], $product->symptoms()->pluck('symptoms.id')->all());
        $this->assertSame('10%', $product->ingredients()->first()->pivot->percentage);
        $this->getJson('/api/v1/products?search=Alvo%20B')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/products/'.$product->slug)->assertOk()->assertJsonCount(2, 'symptoms');
    }

    public function test_blend_form_cannot_assign_or_change_category(): void
    {
        $category = Category::create(['name' => 'Organização', 'slug' => 'organizacao']);
        $this->postJson('/api/v1/admin/products', $this->payload(['category_id' => $category->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('category_id');
        $product = Product::create($this->payload(['slug' => 'blend-ficticio']));
        $this->putJson('/api/v1/admin/products/'.$product->id, $this->payload(['category_id' => $category->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('category_id');
        $this->postJson('/api/v1/admin/categories/'.$category->id.'/products', ['product_ids' => [$product->id]])->assertOk();
        $this->assertSame($category->id, $product->fresh()->category_id);
    }

    public function test_editing_complaints_preserves_category_and_can_clear_all_complaints(): void
    {
        $category = Category::create(['name' => 'Organização', 'slug' => 'organizacao']);
        $first = Symptom::create(['name' => 'Alvo A']);
        $second = Symptom::create(['name' => 'Alvo B']);
        $product = Product::create($this->payload(['slug' => 'blend-ficticio', 'category_id' => $category->id, 'symptom_target' => $first->name]));
        $product->symptoms()->sync([$first->id]);
        $this->putJson('/api/v1/admin/products/'.$product->id, $this->payload(['symptom_ids' => [$second->id]]))
            ->assertOk()->assertJsonPath('product.symptoms.0.id', $second->id)->assertJsonPath('product.category_id', $category->id);
        $this->assertSame($second->name, $product->fresh()->symptom_target);
        $this->putJson('/api/v1/admin/products/'.$product->id, $this->payload(['symptom_ids' => []]))
            ->assertOk()->assertJsonCount(0, 'product.symptoms')->assertJsonPath('product.symptom_target', null);
    }

    public function test_duplicate_or_unknown_complaints_do_not_create_products(): void
    {
        $symptom = Symptom::create(['name' => 'Alvo A']);
        foreach ([[$symptom->id, $symptom->id], [999999]] as $ids) {
            $this->postJson('/api/v1/admin/products', $this->payload(['symptom_ids' => $ids]))->assertUnprocessable();
        }
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('product_symptom', 0);
    }

    public function test_legacy_target_survives_unrelated_edits_and_can_be_cleared(): void
    {
        $product = Product::create($this->payload(['slug' => 'blend-legado', 'symptom_target' => 'Texto legado']));
        $this->putJson('/api/v1/admin/products/'.$product->id, $this->payload())->assertOk()->assertJsonPath('product.symptom_target', 'Texto legado');
        $this->putJson('/api/v1/admin/products/'.$product->id, $this->payload(['symptom_target' => null]))->assertOk()->assertJsonPath('product.symptom_target', null);
    }

    public function test_renaming_and_deleting_complaints_keep_other_product_links(): void
    {
        $first = Symptom::create(['name' => 'Alvo A']);
        $second = Symptom::create(['name' => 'Alvo B']);
        $product = Product::create($this->payload(['slug' => 'blend-ficticio', 'symptom_target' => $first->name]));
        $product->symptoms()->sync([$first->id, $second->id]);
        $this->putJson('/api/v1/admin/symptoms/'.$second->id, ['name' => 'Alvo renomeado'])->assertOk();
        $this->assertSame(1, Product::targetingSymptom('Alvo renomeado')->count());
        $this->deleteJson('/api/v1/admin/symptoms/'.$first->id)->assertOk();
        $this->assertSame([$second->id], $product->symptoms()->pluck('symptoms.id')->all());
        $this->assertSame(0, Product::targetingSymptom($first->name)->count());
        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }

    public function test_complaint_migration_links_known_names_and_preserves_unknown_text(): void
    {
        $migration = require database_path('migrations/2026_10_14_000013_create_product_symptom_table.php');
        $migration->down();
        $known = Symptom::create(['name' => 'Alvo existente']);
        $matched = Product::create($this->payload(['slug' => 'blend-conhecido', 'symptom_target' => $known->name]));
        $legacy = Product::create($this->payload(['slug' => 'blend-legado', 'symptom_target' => 'Texto não cadastrado']));
        $migration->up();
        $this->assertDatabaseHas('product_symptom', ['product_id' => $matched->id, 'symptom_id' => $known->id]);
        $this->assertSame('Texto não cadastrado', $legacy->fresh()->symptom_target);
        $this->assertSame(1, Product::targetingSymptom('Texto não cadastrado')->count());
    }

    public function test_recommendations_and_demand_metrics_include_secondary_complaints(): void
    {
        $first = Symptom::create(['name' => 'Alvo A']);
        $second = Symptom::create(['name' => 'Alvo B']);
        $matched = Product::create($this->payload(['slug' => 'blend-alvos', 'symptom_target' => $first->name]));
        $matched->symptoms()->sync([$first->id, $second->id]);
        Product::create($this->payload(['slug' => 'mais-vendido', 'sales_count' => 100]));
        $customer = User::create(['name' => 'Cliente teste', 'email' => 'recommend@example.test', 'password' => 'a-long-test-password', 'role' => 'customer']);
        $customer->profile()->create(['sexo' => 'Prefiro não dizer', 'canal_aquisicao' => 'Outros', 'problema_principal' => $second->name, 'health_data_consented_at' => now(), 'health_data_consent_version' => '2026-10-v1']);
        $recommendations = app(RecommendationService::class)->getRecommendationsForUser($customer, 1);
        $this->assertSame([$matched->id], $recommendations->modelKeys());
        $this->getJson('/api/v1/admin/health-metrics')->assertOk()->assertJsonFragment(['symptom' => $second->name, 'products_available_count' => 1]);
    }

    public function test_category_ordering_preserves_links_and_rejects_products_from_other_categories(): void
    {
        $first = Category::create(['name' => 'Categoria A', 'slug' => 'categoria-a']);
        $second = Category::create(['name' => 'Categoria B', 'slug' => 'categoria-b']);
        $a = Product::create($this->payload(['slug' => 'blend-a', 'category_id' => $first->id]));
        $b = Product::create($this->payload(['slug' => 'blend-b', 'category_id' => $first->id]));
        $outside = Product::create($this->payload(['slug' => 'blend-c', 'category_id' => $second->id]));
        $first->products()->attach([$a->id, $b->id]);
        $second->products()->attach($outside->id);
        $this->putJson('/api/v1/admin/categories/order', ['category_ids' => [$second->id, $first->id]])->assertOk();
        $this->assertSame([$second->id, $first->id], Category::orderBy('sort_order')->pluck('id')->all());
        $this->putJson('/api/v1/admin/categories/'.$first->id.'/products/order', ['product_ids' => [$b->id, $a->id]])->assertOk();
        $this->assertSame([$b->id, $a->id], $first->products()->pluck('products.id')->all());
        $this->putJson('/api/v1/admin/categories/'.$first->id.'/products/order', ['product_ids' => [$outside->id, $a->id]])->assertUnprocessable();
        $this->assertSame($second->id, $outside->fresh()->category_id);
        $this->deleteJson('/api/v1/admin/categories/'.$first->id)->assertOk();
        $this->assertNull($a->fresh()->category_id);
        $this->assertNull($b->fresh()->category_id);
        $this->assertDatabaseCount('products', 3);
    }

    public function test_failed_audit_rolls_back_product_and_complaint_links(): void
    {
        $symptom = Symptom::create(['name' => 'Alvo A']);
        DB::unprepared("CREATE TRIGGER fail_audit BEFORE INSERT ON security_audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
        $this->postJson('/api/v1/admin/products', $this->payload(['symptom_ids' => [$symptom->id]]))->assertStatus(503);
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('product_symptom', 0);
    }
}
