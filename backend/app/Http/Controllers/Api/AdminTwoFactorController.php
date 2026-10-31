<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

class AdminTwoFactorController extends Controller
{
    public function confirmSetup(Request $request, Google2FA $google2fa): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'digits:6']]);
        $userId = $request->session()->get('admin_mfa_setup_user_id');
        $secret = $request->session()->get('admin_mfa_pending_secret');
        $expiresAt = (int) $request->session()->get('admin_mfa_setup_expires_at', 0);

        if (! $userId || ! $secret || $expiresAt < now()->getTimestamp()) {
            $request->session()->forget([
                'admin_mfa_setup_user_id',
                'admin_mfa_pending_secret',
                'admin_mfa_setup_expires_at',
            ]);

            return response()->json(['message' => 'A configuração expirou. Entre novamente.'], 401);
        }

        $result = DB::transaction(function () use ($userId, $secret, $data, $google2fa) {
            $user = User::whereKey($userId)->where('role', 'admin')->lockForUpdate()->first();
            if (! $user || $user->two_factor_confirmed_at || $user->password_reset_required) {
                return ['status' => 401];
            }

            $step = $google2fa->verifyKeyNewer($secret, $data['code'], -1, 1);
            if ($step === false) {
                return ['status' => 422];
            }

            $recoveryCodes = collect(range(1, 8))
                ->map(fn () => strtoupper(Str::random(16)))
                ->all();

            $user->forceFill([
                'two_factor_secret' => $secret,
                'two_factor_confirmed_at' => now(),
                'two_factor_last_step' => $step,
                'two_factor_recovery_codes' => array_map(
                    fn (string $code) => $this->recoveryCodeHash($code),
                    $recoveryCodes
                ),
            ])->save();

            return ['status' => 200, 'user' => $user, 'recovery_codes' => $recoveryCodes];
        });

        if ($result['status'] === 401) {
            $request->session()->forget([
                'admin_mfa_setup_user_id',
                'admin_mfa_pending_secret',
                'admin_mfa_setup_expires_at',
            ]);

            return response()->json(['message' => 'A configuração expirou. Entre novamente.'], 401);
        }

        if ($result['status'] === 422) {
            return response()->json(['message' => 'Código inválido.'], 422);
        }

        $user = $result['user'];
        $this->completeAdminLogin($request, $user);

        return response()->json([
            'user' => $user->load('profile'),
            'recovery_codes' => $result['recovery_codes'],
        ]);
    }

    public function verify(Request $request, Google2FA $google2fa): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'min:6', 'max:32']]);
        $userId = $request->session()->get('admin_mfa_challenge_user_id');
        $expiresAt = (int) $request->session()->get('admin_mfa_challenge_expires_at', 0);

        if (! $userId || $expiresAt < now()->getTimestamp()) {
            $request->session()->forget(['admin_mfa_challenge_user_id', 'admin_mfa_challenge_expires_at']);

            return response()->json(['message' => 'A autenticação expirou. Entre novamente.'], 401);
        }

        $result = DB::transaction(function () use ($data, $userId, $google2fa) {
            $user = User::whereKey($userId)->where('role', 'admin')->lockForUpdate()->first();
            if (! $user || ! $user->two_factor_confirmed_at || ! $user->two_factor_secret) {
                return null;
            }

            $code = trim($data['code']);
            if (preg_match('/^\d{6}$/', $code)) {
                $step = $google2fa->verifyKeyNewer(
                    $user->two_factor_secret,
                    $code,
                    (int) ($user->two_factor_last_step ?? -1),
                    1
                );
                if ($step !== false) {
                    $user->forceFill(['two_factor_last_step' => $step])->save();

                    return $user;
                }
            }

            $hash = $this->recoveryCodeHash($code);
            $codes = $user->two_factor_recovery_codes ?? [];
            $index = array_search($hash, $codes, true);
            if ($index === false) {
                return null;
            }

            unset($codes[$index]);
            $user->forceFill(['two_factor_recovery_codes' => array_values($codes)])->save();

            return $user;
        });

        if (! $result) {
            Log::notice('Falha na verificação MFA administrativa.', [
                'admin_user_id' => $userId,
                'ip_address' => $request->ip(),
            ]);

            return response()->json(['message' => 'Código inválido ou expirado.'], 422);
        }

        $this->completeAdminLogin($request, $result);

        return response()->json(['user' => $result->load('profile')]);
    }

    private function completeAdminLogin(Request $request, User $user): void
    {
        $request->session()->forget([
            'admin_mfa_setup_user_id',
            'admin_mfa_pending_secret',
            'admin_mfa_setup_expires_at',
            'admin_mfa_challenge_user_id',
            'admin_mfa_challenge_expires_at',
        ]);
        Auth::guard('admin')->login($user);
        $request->session()->regenerate();
        $request->session()->put('admin_mfa_confirmed_user_id', $user->id);
        $request->session()->put('admin_mfa_confirmed_profile', $user->admin_profile);
        $request->session()->put('admin_mfa_access_version', (int) $user->admin_access_version);
        $request->session()->put('admin_mfa_confirmed_at', now()->getTimestamp());
    }

    private function recoveryCodeHash(string $code): string
    {
        return hash_hmac('sha256', strtoupper(trim($code)), (string) config('app.key'));
    }
}
