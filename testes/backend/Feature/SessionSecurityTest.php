<?php

namespace Tests\Feature;

use App\Auth\SessionContext;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class SessionSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_csrf_is_enforced_outside_the_testing_bypass(): void
    {
        // O Laravel ignora CSRF quando app->runningUnitTests() é verdadeiro.
        $this->app['env'] = 'local';
        $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/v1/login', [
            'email' => 'customer@example.test', 'password' => 'a-long-test-password',
        ])->assertStatus(419);

        $this->withSession(['_token' => 'csrf-test-value'])->withHeader('X-CSRF-TOKEN', 'csrf-test-value')
            ->postJson('/api/v1/login', ['email' => 'customer@example.test', 'password' => 'a-long-test-password'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_technical_admin_must_confirm_mfa_and_recovery_code_is_single_use(): void
    {
        $google2fa = app(Google2FA::class);
        $admin = User::create(['name' => 'Técnico teste', 'email' => 'technical@example.test', 'password' => 'a-long-test-password', 'role' => 'admin']);
        $admin->forceFill(['admin_profile' => 'technical'])->save();
        $this->withHeader('Origin', 'http://localhost:3000');
        $credentials = ['email' => $admin->email, 'password' => 'a-long-test-password'];
        $login = $this->postJson('/api/v1/admin/auth/login', $credentials)->assertOk()->assertJsonPath('requires_two_factor_setup', true);
        $this->getJson('/api/v1/admin/system-status')->assertUnauthorized();
        $setup = $this->postJson('/api/v1/admin/auth/two-factor/confirm-setup', ['code' => $google2fa->getCurrentOtp($login->json('secret'))])
            ->assertOk()->assertJsonPath('user.admin_permissions', ['system.view']);
        $code = $setup->json('recovery_codes.0');
        $this->getJson('/api/v1/admin/system-status')->assertOk();
        $this->getJson('/api/v1/admin/orders')->assertForbidden();
        $this->postJson('/api/v1/admin/auth/logout')->assertOk();
        // Forget the cached guard between simulated requests, as in a real request lifecycle.
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/system-status')->assertUnauthorized();
        $this->postJson('/api/v1/admin/auth/login', $credentials)->assertOk()->assertJsonPath('requires_two_factor', true);
        $this->postJson('/api/v1/admin/auth/two-factor/verify', ['code' => $code])->assertOk();
        $this->assertCount(7, $admin->fresh()->two_factor_recovery_codes);
        $this->postJson('/api/v1/admin/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/admin/auth/login', $credentials)->assertOk();
        $this->postJson('/api/v1/admin/auth/two-factor/verify', ['code' => $code])->assertUnprocessable();
    }

    public function test_customer_and_admin_sessions_coexist_and_logout_independently(): void
    {
        $customer = User::create(['name' => 'Cliente teste', 'email' => 'customer@example.test', 'password' => 'a-long-test-password', 'role' => 'customer']);
        $admin = User::create(['name' => 'Proprietário teste', 'email' => 'owner@example.test', 'password' => 'a-long-test-password', 'role' => 'admin']);
        $admin->forceFill(['admin_profile' => 'owner'])->save();
        $this->withHeader('Origin', 'http://localhost:3000');
        $this->postJson('/api/v1/login', ['email' => $customer->email, 'password' => 'a-long-test-password'])->assertOk();
        $customerSession = $this->app['session']->forContext('customer')->getId();
        $setup = $this->postJson('/api/v1/admin/auth/login', ['email' => $admin->email, 'password' => 'a-long-test-password'])->assertOk();
        $this->postJson('/api/v1/admin/auth/two-factor/confirm-setup', ['code' => app(Google2FA::class)->getCurrentOtp($setup->json('secret'))])->assertOk();
        $adminSession = $this->app['session']->forContext('admin')->getId();
        $this->assertNotSame($customerSession, $adminSession);
        $this->assertSame($customerSession, $this->app['session']->forContext('customer')->getId());
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('user.id', $customer->id);
        $this->getJson('/api/v1/admin/auth/me')->assertOk()->assertJsonPath('user.id', $admin->id);

        $this->postJson('/api/v1/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
        $this->getJson('/api/v1/admin/auth/me')->assertOk()->assertJsonPath('user.id', $admin->id);
        $this->postJson('/api/v1/login', ['email' => $customer->email, 'password' => 'a-long-test-password'])->assertOk();
        $this->postJson('/api/v1/admin/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/auth/me')->assertUnauthorized();
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('user.id', $customer->id);
    }

    public function test_logins_reject_the_other_role_without_starting_mfa_or_authenticating(): void
    {
        $customer = User::create(['name' => 'Cliente teste', 'email' => 'wrong-customer@example.test', 'password' => 'a-long-test-password', 'role' => 'customer']);
        $admin = User::create(['name' => 'Admin teste', 'email' => 'wrong-admin@example.test', 'password' => 'a-long-test-password', 'role' => 'admin']);
        $this->withHeader('Origin', 'http://localhost:3000');
        $this->postJson('/api/v1/login', ['email' => $admin->email, 'password' => 'a-long-test-password'])->assertUnprocessable()->assertJsonValidationErrors('email')->assertJsonMissingPath('secret');
        $this->postJson('/api/v1/admin/auth/login', ['email' => $customer->email, 'password' => 'a-long-test-password'])->assertUnprocessable()->assertJsonValidationErrors('email')->assertJsonMissingPath('secret');
        $this->assertGuest('web');
        $this->assertGuest('admin');
        $this->assertNull($this->app['auth']->guard('web')->getProvider()->retrieveById($admin->id));
        $this->assertNull($this->app['auth']->guard('admin')->getProvider()->retrieveById($customer->id));
        $this->postJson('/api/v1/auth/two-factor/verify', ['code' => '000000'])->assertNotFound();
    }

    public function test_csrf_tokens_and_cookies_are_specific_to_each_context(): void
    {
        $this->app['env'] = 'local';
        $this->withHeader('Origin', 'http://localhost:3000');
        $this->withSession(['_token' => 'customer-csrf']);
        $this->withAdminSession(['_token' => 'admin-csrf']);
        $this->withHeader('X-CSRF-TOKEN', 'customer-csrf')->postJson('/api/v1/admin/auth/login', ['email' => 'nobody@example.test', 'password' => 'a-long-test-password'])->assertStatus(419);
        $this->withHeader('X-CSRF-TOKEN', 'admin-csrf')->postJson('/api/v1/login', ['email' => 'nobody@example.test', 'password' => 'a-long-test-password'])->assertStatus(419);
        $this->postJson('/api/v1/admin/auth/login', ['email' => 'nobody@example.test', 'password' => 'a-long-test-password'])->assertUnprocessable();
        $this->getJson('/api/v1/admin/auth/csrf-cookie')->assertNoContent()
            ->assertCookie(SessionContext::cookie('admin'))->assertCookie('ADMIN-XSRF-TOKEN')
            ->assertCookieMissing(SessionContext::cookie('customer'))->assertCookieMissing('XSRF-TOKEN');
    }

    public function test_admin_routes_do_not_accept_bearer_tokens_or_customer_sessions(): void
    {
        $admin = User::create(['name' => 'Admin teste', 'email' => 'token-admin@example.test', 'password' => 'a-long-test-password', 'role' => 'admin']);
        $customer = User::create(['name' => 'Cliente teste', 'email' => 'token-customer@example.test', 'password' => 'a-long-test-password', 'role' => 'customer']);
        $token = $admin->createToken('test-only')->plainTextToken;
        $this->withHeaders(['Origin' => 'http://localhost:3000', 'Authorization' => 'Bearer '.$token]);
        $this->getJson('/api/v1/admin/orders')->assertUnauthorized();
        $this->getJson('/api/v1/me')->assertForbidden();
        $this->withoutHeader('Authorization');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/login', ['email' => $customer->email, 'password' => 'a-long-test-password'])->assertOk();
        $this->getJson('/api/v1/admin/auth/me')->assertUnauthorized();
        $this->postJson('/api/v1/admin/auth/logout')->assertUnauthorized();
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('user.id', $customer->id);
    }
}
