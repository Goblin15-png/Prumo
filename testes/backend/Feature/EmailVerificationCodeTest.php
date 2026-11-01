<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\EmailVerificationCode;
use App\Services\EmailVerificationCodes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmailVerificationCodeTest extends TestCase
{
    use RefreshDatabase;

    private function customer(string $email = 'buyer@example.test'): User
    {
        return User::create(['name' => 'Pessoa fictícia', 'email' => $email, 'password' => 'only-a-test-password', 'role' => 'customer']);
    }

    public function test_code_is_hashed_hidden_and_sent_to_customer_by_fixed_sender(): void
    {
        Notification::fake();
        $user = $this->customer();
        app(EmailVerificationCodes::class)->send($user);
        $user->refresh();
        Notification::assertSentTo($user, EmailVerificationCode::class, function ($notification) use ($user) {
            $this->assertTrue(Hash::check($notification->code, $user->email_code_hash));
            $this->assertSame(['bernadin15.dev@gmail.com', 'PRUMA ESSENTIAL'], $notification->toMail($user)->from);
            $this->assertSame('buyer@example.test', $user->routeNotificationFor('mail'));

            return true;
        });
        $this->assertArrayNotHasKey('email_code_hash', $user->toArray());
        $this->assertArrayNotHasKey('email_code_attempts', $user->toArray());
    }

    public function test_customer_confirms_own_code_and_cannot_confirm_another_account(): void
    {
        Notification::fake();
        $user = $this->customer();
        app(EmailVerificationCodes::class)->send($user);
        $code = Notification::sent($user, EmailVerificationCode::class)->first()->code;
        $other = $this->customer('other@example.test');
        Sanctum::actingAs($other);
        $this->postJson('/api/v1/email/confirm-code', ['code' => $code, 'id' => $user->id])->assertUnprocessable();
        $this->assertNull($user->fresh()->email_verified_at);
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/email/confirm-code', ['code' => $code])->assertOk()->assertJsonMissingPath('user.email_code_hash');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertNull($user->fresh()->email_code_hash);
    }

    public function test_five_failed_attempts_block_even_the_correct_code(): void
    {
        $user = $this->customer();
        $user->forceFill(['email_code_hash' => Hash::make('123456'), 'email_code_expires_at' => now()->addMinutes(10)])->save();
        Sanctum::actingAs($user);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/email/confirm-code', ['code' => '654321'])->assertUnprocessable();
        }
        $this->assertSame(5, $user->fresh()->email_code_attempts);
        $this->postJson('/api/v1/email/confirm-code', ['code' => '123456'])->assertUnprocessable();
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_expired_code_and_missing_session_are_rejected(): void
    {
        $this->postJson('/api/v1/email/confirm-code', ['code' => '123456'])->assertUnauthorized();
        $user = $this->customer();
        $user->forceFill(['email_code_hash' => Hash::make('123456'), 'email_code_expires_at' => now()->subSecond()])->save();
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/email/confirm-code', ['code' => '123456'])->assertUnprocessable();
        $this->postJson('/api/v1/email/confirm-code', ['code' => '123'])->assertUnprocessable();
    }

    public function test_resend_waits_one_minute_and_replaces_old_hash(): void
    {
        Notification::fake();
        $user = $this->customer();
        $service = app(EmailVerificationCodes::class);
        $service->send($user);
        $hash = $user->fresh()->email_code_hash;
        try {
            $service->send($user);
            $this->fail('Reenvio imediato deveria falhar.');
        } catch (ValidationException) {
            $this->assertSame($hash, $user->fresh()->email_code_hash);
        }
        $this->travel(61)->seconds();
        $service->send($user);
        $this->assertNotSame($hash, $user->fresh()->email_code_hash);
        Notification::assertSentToTimes($user, EmailVerificationCode::class, 2);
    }

    public function test_delivery_failure_invalidates_code_and_returns_service_error(): void
    {
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('fake SMTP error'));
        $user = $this->customer();
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/email/verification-notification')->assertStatus(503);
        $this->assertNull($user->fresh()->email_code_hash);
        $this->assertNull($user->fresh()->email_code_sent_at);
    }
}
