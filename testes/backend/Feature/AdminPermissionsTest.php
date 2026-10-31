<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AdminPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(?string $profile): User
    {
        $user = User::create(['name' => 'Admin teste', 'email' => 'admin@example.test', 'password' => 'a-long-test-password', 'role' => 'admin']);
        $user->forceFill(['admin_profile' => $profile])->save();
        $this->actingAs($user, 'admin');
        $this->withHeader('Origin', 'http://localhost:3000')->withAdminSession([
            'admin_mfa_confirmed_user_id' => $user->id,
            'admin_mfa_access_version' => 0, 'admin_mfa_confirmed_profile' => $profile,
            'admin_mfa_confirmed_at' => now()->getTimestamp(),
        ]);

        return $user;
    }

    public function test_every_admin_route_has_an_operation_gate(): void
    {
        $count = 0;
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/admin/') || str_starts_with($route->uri(), 'api/v1/admin/auth/')) {
                continue;
            }
            $this->assertNotEmpty(array_filter($route->gatherMiddleware(), fn ($middleware) => str_starts_with($middleware, 'can:')), $route->uri());
            $count++;
        }
        $this->assertGreaterThan(20, $count);
    }

    public function test_technical_admin_cannot_access_any_commercial_operation(): void
    {
        $admin = $this->admin('technical');
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/v1/admin/') || str_starts_with($route->uri(), 'api/v1/admin/auth/') || str_ends_with($route->uri(), '/system-status')) {
                continue;
            }
            $uri = '/'.preg_replace('/\{[^}]+\}/', '1', $route->uri());
            $this->json($route->methods()[0], $uri)->assertForbidden();
        }
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('security_audit_logs', 0);
        $this->getJson('/api/v1/admin/system-status')->assertOk()->assertExactJson(['api' => 'available', 'database' => 'available']);
        $this->assertSame(['system.view'], $admin->admin_permissions);
    }

    public function test_owner_has_commercial_permissions_but_no_technical_access(): void
    {
        $admin = $this->admin('owner');
        $this->getJson('/api/v1/admin/categories')->assertOk();
        $this->getJson('/api/v1/admin/orders')->assertOk();
        $this->getJson('/api/v1/admin/system-status')->assertForbidden();
        $this->assertTrue(Gate::forUser($admin)->allows('products.create'));
        $this->assertFalse(Gate::forUser($admin)->allows('system.view'));
    }

    public function test_legacy_unknown_and_changed_profiles_are_denied(): void
    {
        $admin = $this->admin(null);
        $this->getJson('/api/v1/admin/categories')->assertForbidden();
        $admin->forceFill(['admin_profile' => 'unknown'])->save();
        $this->getJson('/api/v1/admin/categories')->assertForbidden();
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $this->getJson('/api/v1/admin/categories')->assertForbidden();
    }

    public function test_public_registration_cannot_assign_role_or_permissions(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/register', [
            'name' => 'Cliente teste', 'email' => 'customer@example.test',
            'password' => 'a-long-test-password', 'password_confirmation' => 'a-long-test-password',
            'role' => 'admin', 'admin_profile' => 'owner', 'admin_permissions' => ['orders.view'],
        ])->assertCreated()->assertJsonPath('user.role', 'customer')->assertJsonPath('user.admin_permissions', []);
        $user = User::where('email', 'customer@example.test')->firstOrFail();
        $this->assertNull($user->admin_profile);
        $user->forceFill(['admin_profile' => 'owner'])->save();
        $this->assertSame([], $user->admin_permissions);
        $this->assertFalse(Gate::forUser($user)->allows('orders.view'));
    }

    public function test_profile_cannot_be_mass_assigned(): void
    {
        $admin = $this->admin(null);
        $admin->fill(['admin_profile' => 'owner'])->save();
        $this->assertNull($admin->fresh()->admin_profile);
    }

    public function test_profile_assignment_revokes_sessions_and_tokens_and_is_audited(): void
    {
        $admin = $this->admin(null);
        $admin->createToken('old-token');
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $admin->id, 'payload' => '', 'last_activity' => time()]);
        $this->artisan('admin:assign-profile', ['email' => $admin->email, 'profile' => 'owner'])
            ->expectsConfirmation('Alterar o perfil deste administrador para owner e revogar as sessões existentes?', 'yes')->assertSuccessful();
        $this->assertSame('owner', $admin->fresh()->admin_profile);
        $this->assertDatabaseMissing('sessions', ['id' => 'old-session']);
        $this->assertSame(0, $admin->tokens()->count());
        $this->assertDatabaseHas('security_audit_logs', ['admin_user_id' => null, 'method' => 'CLI', 'action' => 'CLI admin-profile user:'.$admin->id.' none->owner']);
    }

    public function test_profile_assignment_rejects_invalid_profile_and_customer_promotion(): void
    {
        $admin = $this->admin(null);
        $this->artisan('admin:assign-profile', ['email' => $admin->email, 'profile' => 'superadmin'])->assertFailed();
        $admin->forceFill(['role' => 'customer'])->save();
        $this->artisan('admin:assign-profile', ['email' => $admin->email, 'profile' => 'owner'])->assertFailed();
        $this->assertNull($admin->fresh()->admin_profile);
    }

    public function test_reassigning_the_same_profile_invalidates_existing_mfa_sessions(): void
    {
        $admin = $this->admin('owner');
        $this->artisan('admin:assign-profile', ['email' => $admin->email, 'profile' => 'owner'])
            ->expectsConfirmation('Alterar o perfil deste administrador para owner e revogar as sessões existentes?', 'yes')->assertSuccessful();
        $admin->refresh();
        $this->assertSame(1, (int) $admin->admin_access_version);
        // Mesmo perfil, mas a sessão anterior tem versão zero; independe do driver de sessão.
        $this->getJson('/api/v1/admin/categories')->assertForbidden();
    }

    public function test_failed_profile_audit_rolls_back_privileges_and_token_revocation(): void
    {
        $admin = $this->admin(null);
        $admin->createToken('old-token');
        DB::unprepared("CREATE TRIGGER fail_audit BEFORE INSERT ON security_audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
        try {
            $this->artisan('admin:assign-profile', ['email' => $admin->email, 'profile' => 'owner'])
                ->expectsConfirmation('Alterar o perfil deste administrador para owner e revogar as sessões existentes?', 'yes')->run();
            $this->fail('A atribuição deveria falhar quando a auditoria falha.');
        } catch (QueryException) {
            $this->assertNull($admin->fresh()->admin_profile);
            $this->assertSame(0, (int) $admin->fresh()->admin_access_version);
            $this->assertSame(1, $admin->tokens()->count());
        }
    }

    public function test_cancelled_profile_assignment_does_not_change_access(): void
    {
        $admin = $this->admin(null);
        $this->artisan('admin:assign-profile', ['email' => $admin->email, 'profile' => 'owner'])
            ->expectsConfirmation('Alterar o perfil deste administrador para owner e revogar as sessões existentes?', 'no')->assertFailed();
        $this->assertNull($admin->fresh()->admin_profile);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }
}
