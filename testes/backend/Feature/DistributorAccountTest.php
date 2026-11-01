<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class DistributorAccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_distributor_registration_keeps_customer_role_and_can_access_lots(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/register', [
            'name' => 'Distribuidor Teste', 'email' => 'distributor@example.test',
            'password' => 'a-long-test-password', 'password_confirmation' => 'a-long-test-password',
            'account_type' => 'distributor', 'role' => 'admin', 'cnpj' => '12.ABC.345/01DE-35',
        ])->assertCreated()->assertJsonPath('user.is_distributor', true)
            ->assertJsonPath('user.cnpj', '12ABC34501DE35')->assertJsonPath('user.role', 'customer')->assertJsonPath('user.admin_permissions', []);

        $user = User::where('email', 'distributor@example.test')->firstOrFail();
        $this->actingAs($user)->getJson('/api/v1/distributor/lots')->assertOk()->assertExactJson(['lots' => []]);
    }

    public function test_lots_require_an_authenticated_distributor(): void
    {
        $this->getJson('/api/v1/distributor/lots')->assertUnauthorized();
        $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->getJson('/api/v1/distributor/lots')->assertForbidden();
    }

    public function test_invalid_account_type_is_rejected(): void
    {
        $this->postJson('/api/v1/register', [
            'name' => 'Teste', 'email' => 'invalid@example.test',
            'password' => 'a-long-test-password', 'password_confirmation' => 'a-long-test-password',
            'account_type' => 'admin',
        ])->assertUnprocessable()->assertJsonValidationErrors('account_type');
    }
    public function test_distributor_requires_a_valid_cnpj(): void
    {
        foreach ([null, '00000000000000', '12ABC34501DE34', '12!ABC34501DE35'] as $cnpj) {
            $this->postJson('/api/v1/register', [
                'name' => 'Teste', 'email' => 'cnpj@example.test',
                'password' => 'a-long-test-password', 'password_confirmation' => 'a-long-test-password',
                'account_type' => 'distributor', 'cnpj' => $cnpj,
            ])->assertUnprocessable()->assertJsonValidationErrors('cnpj');
        }
        $this->assertDatabaseMissing('users', ['email' => 'cnpj@example.test']);
    }

}
