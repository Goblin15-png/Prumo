<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\EmailVerificationCodes;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class EmailVerificationController extends Controller
{
    public function verify(int $id, string $hash): RedirectResponse
    {
        $user = User::findOrFail($id);

        abort_unless(hash_equals(sha1($user->getEmailForVerification()), $hash), 403);

        if (! $user->hasVerifiedEmail() && $user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        return redirect()->away(rtrim((string) config('app.frontend_url'), '/').'/?email_verified=success');
    }

    public function confirm(Request $request, EmailVerificationCodes $codes): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'regex:/^[0-9]{6}$/']]);
        $user = $codes->confirm($request->user(), $data['code']);

        return response()->json(['message' => 'Email confirmado. Você já pode continuar sua compra.', 'user' => $user->load('profile')]);
    }

    public function resend(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Este email já está confirmado.']);
        }

        try {
            $user->sendEmailVerificationNotification();
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (\Throwable $exception) {
            Log::warning('Falha ao reenviar confirmação de email.', [
                'exception' => get_class($exception),
            ]);

            return response()->json(['message' => 'Não foi possível enviar o email agora. Tente novamente mais tarde.'], 503);
        }

        return response()->json(['message' => 'Enviamos um código de confirmação. Confira seu email e a pasta de spam.'], 202);
    }
}
