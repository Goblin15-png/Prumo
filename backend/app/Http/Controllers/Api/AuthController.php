<?php

namespace App\Http\Controllers\Api;

use App\Auth\SessionContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\TransientToken;
use PragmaRX\Google2FA\Google2FA;

class AuthController extends Controller
{
    /**
     * Cria uma conta de cliente. O perfil botânico é opcional e preenchido depois.
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:12', 'max:128', 'confirmed'],
        ]);

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => $validated['password'],
                'role' => 'customer',
            ]);

            return $user;
        });

        $localTestMode = app()->environment('local') && (bool) config('services.local_test_mode');
        if ($localTestMode) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        $verificationSent = false;
        if (! $localTestMode) {
            try {
                $user->sendEmailVerificationNotification();
                $verificationSent = true;
            } catch (\Throwable $exception) {
                Log::warning('Falha ao enviar confirmação de email.', [
                    'exception' => get_class($exception),
                ]);
            }
        }

        return response()->json([
            'message' => $localTestMode
                ? 'Conta criada no modo de teste local. Nenhum email de confirmação é necessário.'
                : ($verificationSent ? 'Conta criada. Digite o código enviado ao seu email.' : 'Conta criada, mas não foi possível enviar o código. Solicite o reenvio para confirmar seu email.'),
            'email_verification_sent' => $verificationSent,
            'email_verification_required' => ! $localTestMode,
            'user' => $user->load('profile'),
        ], 201);
    }

    /**
     * Login seguro
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:128'],
        ]);

        $user = User::with('profile')->where('email', $request->email)->first();

        $administrative = SessionContext::forRequest($request) === 'admin';
        if (! $user || ! Hash::check($request->password, $user->password)
            || $user->role !== ($administrative ? 'admin' : 'customer')) {
            Log::notice('Falha de autenticação.', [
                'account_fingerprint' => hash_hmac('sha256', Str::lower((string) $request->email), (string) config('app.key')),
                'ip_address' => $request->ip(),
            ]);

            throw ValidationException::withMessages([
                'email' => ['As credenciais fornecidas estão incorretas.'],
            ]);
        }

        if (config('hashing.rehash_on_login') && Hash::needsRehash($user->password)) {
            $user->forceFill(['password' => $request->password])->save();
        }

        Auth::guard($administrative ? 'admin' : 'web')->logout();
        $request->session()->forget([
            'admin_mfa_setup_user_id',
            'admin_mfa_pending_secret',
            'admin_mfa_setup_expires_at',
            'admin_mfa_challenge_user_id',
            'admin_mfa_challenge_expires_at',
            'admin_mfa_confirmed_user_id',
            'admin_mfa_confirmed_at',
            'admin_mfa_confirmed_profile',
            'admin_mfa_access_version',
        ]);
        $request->session()->regenerate();

        if ($administrative) {
            if ($user->password_reset_required) {
                return response()->json([
                    'requires_password_reset' => true,
                    'message' => 'Por segurança, redefina sua senha pelo link enviado ao seu email antes de continuar.',
                ]);
            }

            if (! $user->two_factor_confirmed_at) {
                $secret = app(Google2FA::class)->generateSecretKey();
                $request->session()->put([
                    'admin_mfa_setup_user_id' => $user->id,
                    'admin_mfa_pending_secret' => $secret,
                    'admin_mfa_setup_expires_at' => now()->addMinutes(10)->getTimestamp(),
                ]);

                return response()->json([
                    'requires_two_factor_setup' => true,
                    'secret' => $secret,
                    'otpauth_url' => $this->twoFactorUrl($user, $secret),
                ]);
            }

            $request->session()->put([
                'admin_mfa_challenge_user_id' => $user->id,
                'admin_mfa_challenge_expires_at' => now()->addMinutes(5)->getTimestamp(),
            ]);

            return response()->json(['requires_two_factor' => true]);
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json([
            'message' => 'Login realizado com sucesso!',
            'user' => $user,
        ]);
    }

    /**
     * Retorna dados do usuário autenticado
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('profile');

        return response()->json([
            'user' => $user,
        ]);
    }

    public function sendPasswordResetLink(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);

        try {
            Password::sendResetLink(['email' => $data['email']]);
        } catch (\Throwable $exception) {
            // Same response regardless of account existence or mail availability.
            Log::warning('Falha ao enviar email de redefinição de senha.', [
                'exception' => get_class($exception),
            ]);
        }

        return response()->json([
            'message' => 'Se o endereço puder receber recuperação, enviaremos as instruções.',
        ], 202);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:12', 'max:128', 'confirmed'],
        ]);

        $status = Password::reset($data, function (User $user, string $password) {
            $user->forceFill([
                'password' => $password,
                'remember_token' => Str::random(60),
                'password_reset_required' => false,
            ])->save();
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Link inválido ou expirado.'], 422);
        }

        return response()->json(['message' => 'Senha redefinida. Entre novamente.']);
    }

    private function twoFactorUrl(User $user, string $secret): string
    {
        $issuer = (string) config('app.name');
        $label = rawurlencode($issuer.':'.$user->email);
        $query = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => 6,
            'period' => 30,
        ]);

        return "otpauth://totp/{$label}?{$query}";
    }

    /**
     * Encerra a sessão
     */
    public function logout(Request $request): JsonResponse
    {
        $accessToken = $request->user()->currentAccessToken();
        if ($accessToken && ! ($accessToken instanceof TransientToken)) {
            $accessToken->delete();
        }

        if ($request->hasSession()) {
            Auth::guard(SessionContext::forRequest($request) === 'admin' ? 'admin' : 'web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Sessão encerrada com sucesso.',
        ]);
    }
}
