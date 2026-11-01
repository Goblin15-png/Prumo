<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\EmailVerificationCode;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class EmailVerificationCodes
{
    public function send(User $user): void
    {
        // Transportes locais não podem fingir entrega em produção.
        if (app()->environment('production') && in_array(config('mail.default'), ['log', 'array', 'failover'], true)) {
            throw new \RuntimeException('Configure um transporte real de email.');
        }
        $code = (string) random_int(100000, 999999);
        $hash = Hash::make($code);
        $sent = DB::transaction(function () use ($user, $hash) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($locked->hasVerifiedEmail()) return false;
            if ($locked->email_code_sent_at?->gt(now()->subMinute())) {
                throw ValidationException::withMessages(['email' => 'Aguarde 60 segundos antes de pedir outro código.']);
            }
            $locked->forceFill([
                'email_code_hash' => $hash,
                'email_code_expires_at' => now()->addMinutes(10),
                'email_code_sent_at' => now(),
                'email_code_attempts' => 0,
            ])->save();

            return true;
        });
        if (! $sent) return;
        try {
            // Síncrono: a API não anuncia envio quando o transporte falha.
            $user->notify(new EmailVerificationCode($code));
        } catch (\Throwable $exception) {
            User::whereKey($user->id)->where('email_code_hash', $hash)->update([
                'email_code_hash' => null, 'email_code_expires_at' => null, 'email_code_sent_at' => null,
            ]);
            throw $exception;
        }
    }

    public function confirm(User $user, string $code): User
    {
        // Retornar o erro após o commit preserva a contagem de tentativas incorretas.
        $verified = false;
        $result = DB::transaction(function () use ($user, $code, &$verified) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($locked->hasVerifiedEmail()) return $locked;
            if (! $locked->email_code_hash || ! $locked->email_code_expires_at?->isFuture() || $locked->email_code_attempts >= 5) return null;
            if (! Hash::check($code, $locked->email_code_hash)) {
                $locked->increment('email_code_attempts');

                return null;
            }
            $locked->forceFill([
                'email_verified_at' => now(), 'email_code_hash' => null,
                'email_code_expires_at' => null, 'email_code_sent_at' => null, 'email_code_attempts' => 0,
            ])->save();

            $verified = true;

            return $locked;
        });
        if (! $result) {
            throw ValidationException::withMessages(['code' => 'Código inválido, expirado ou com tentativas esgotadas. Solicite outro se necessário.']);
        }
        if ($verified) event(new Verified($result));

        return $result;
    }
}
