<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminProvisioningTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('profiles')]
    public function test_creation_is_audited_and_first_login_requires_mfa(string $profile): void
    {
        $email = $profile.'@example.test';
        $password = 'a-long-provisioning-password';
        $this->artisan('admin:create', ['email' => strtoupper($email), 'profile' => $profile])
            ->expectsQuestion('Nome completo do administrador', 'Responsável individual')
            ->expectsQuestion('Senha (12 a 128 caracteres)', $password)
            ->expectsQuestion('Confirme a senha', $password)
            ->expectsConfirmation('Criar a conta administrativa '.$email.' com perfil '.$profile.' neste banco?', 'yes')
            ->doesntExpectOutputToContain($password)
            ->assertSuccessful();

        $user = User::where('email', $email)->firstOrFail();
        $this->assertSame('Responsável individual', $user->name);
        $this->assertSame('admin', $user->role);
        $this->assertSame($profile, $user->admin_profile);
        $this->assertTrue(Hash::check($password, $user->password));
        $this->assertFalse($user->password_reset_required);
        $this->assertNull($user->two_factor_secret);
        $this->assertNull($user->two_factor_confirmed_at);
        $this->assertNull($user->two_factor_recovery_codes);
        $this->assertDatabaseCount('security_audit_logs', 1);
        $this->assertDatabaseHas('security_audit_logs', [
            'admin_user_id' => null,
            'action' => 'CLI admin-create user:'.$user->id.' profile:'.$profile,
            'method' => 'CLI', 'route' => 'console/admin:create', 'status_code' => 201,
        ]);
        if ($profile === 'technical') {
            $this->assertSame(['system.view'], $user->admin_permissions);
        } else {
            $this->assertContains('orders.view', $user->admin_permissions);
            $this->assertNotContains('system.view', $user->admin_permissions);
        }

        $this->withHeader('Origin', 'http://localhost:3000')
            ->postJson('/api/v1/admin/auth/login', ['email' => $email, 'password' => $password])
            ->assertOk()->assertJsonPath('requires_two_factor_setup', true);
        $this->getJson('/api/v1/admin/auth/me')->assertUnauthorized();
        $this->getJson('/api/v1/admin/orders')->assertUnauthorized();
    }

    public static function profiles(): array
    {
        return [['owner'], ['technical']];
    }

    #[DataProvider('existingRoles')]
    public function test_existing_account_is_never_changed_or_promoted(string $role): void
    {
        $user = User::create(['name' => 'Conta existente', 'email' => 'Existing@example.test', 'password' => 'an-existing-password', 'role' => $role]);
        $before = $user->fresh()->getAttributes();
        $this->artisan('admin:create', ['email' => 'existing@example.test', 'profile' => 'owner'])->assertFailed();
        $this->assertSame($before, $user->fresh()->getAttributes());
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }

    public static function existingRoles(): array
    {
        return [['customer'], ['admin']];
    }

    #[DataProvider('invalidIdentities')]
    public function test_invalid_email_or_profile_creates_nothing(string $email, string $profile): void
    {
        $this->artisan('admin:create', compact('email', 'profile'))->assertFailed();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }

    public static function invalidIdentities(): array
    {
        return [['invalid-email', 'owner'], ['owner@example.test', 'superadmin'], ['owner@example.test', 'none']];
    }

    #[DataProvider('invalidCredentials')]
    public function test_invalid_name_or_password_creates_nothing(string $name, string $password, string $confirmation): void
    {
        $this->artisan('admin:create', ['email' => 'owner@example.test', 'profile' => 'owner'])
            ->expectsQuestion('Nome completo do administrador', $name)
            ->expectsQuestion('Senha (12 a 128 caracteres)', $password)
            ->expectsQuestion('Confirme a senha', $confirmation)
            ->assertFailed();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }

    public static function invalidCredentials(): array
    {
        return [
            ['Responsável', 'short', 'short'],
            ['Responsável', str_repeat('a', 129), str_repeat('a', 129)],
            ['Responsável', 'a-long-test-password', 'a-different-password'],
            ['', 'a-long-test-password', 'a-long-test-password'],
        ];
    }

    public function test_cancelled_or_noninteractive_creation_creates_nothing(): void
    {
        $arguments = ['email' => 'owner@example.test', 'profile' => 'owner'];
        $this->artisan('admin:create', [...$arguments, '--no-interaction' => true])->assertFailed();
        $this->artisan('admin:create', $arguments)
            ->expectsQuestion('Nome completo do administrador', 'Responsável')
            ->expectsQuestion('Senha (12 a 128 caracteres)', 'a-long-test-password')
            ->expectsQuestion('Confirme a senha', 'a-long-test-password')
            ->expectsConfirmation('Criar a conta administrativa owner@example.test com perfil owner neste banco?', 'no')
            ->assertFailed();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }

    public function test_failed_audit_rolls_back_the_new_admin(): void
    {
        DB::unprepared("CREATE TRIGGER fail_audit BEFORE INSERT ON security_audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
        $this->artisan('admin:create', ['email' => 'owner@example.test', 'profile' => 'owner'])
            ->expectsQuestion('Nome completo do administrador', 'Responsável')
            ->expectsQuestion('Senha (12 a 128 caracteres)', 'a-long-test-password')
            ->expectsQuestion('Confirme a senha', 'a-long-test-password')
            ->expectsConfirmation('Criar a conta administrativa owner@example.test com perfil owner neste banco?', 'yes')
            ->doesntExpectOutputToContain('a-long-test-password')
            ->doesntExpectOutputToContain('insert into')
            ->assertFailed();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('security_audit_logs', 0);
    }
}
