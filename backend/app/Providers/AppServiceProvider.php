<?php

namespace App\Providers;

use App\Auth\AdminPermissions;
use App\Auth\ContextSessionManager;
use App\Models\User;
use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Auth\SessionGuard;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton('session', fn ($app) => new ContextSessionManager($app));
        $this->app->bind('session.store', fn ($app) => $app['session']->driver());
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Auth::provider('role-scoped', fn ($app, array $config) => (new EloquentUserProvider($app['hash'], $config['model']))
            ->withQuery(fn ($query) => $query->where('role', $config['role'])));
        Auth::extend('context-session', function ($app, string $name, array $config) {
            $guard = new SessionGuard(
                $name,
                Auth::createUserProvider($config['provider']),
                $app['session']->forContext($name === 'admin' ? 'admin' : 'customer'),
                rehashOnLogin: config('hashing.rehash_on_login', true),
                timeboxDuration: config('auth.timebox_duration', 200000),
                hashKey: config('app.key'),
            );
            $guard->setCookieJar($app['cookie']);
            $guard->setDispatcher($app['events']);
            $guard->setRequest($app->refresh('request', $guard, 'setRequest'));

            return $guard;
        });
        foreach ([...AdminPermissions::OWNER, 'system.view'] as $permission) {
            Gate::define($permission, fn (User $user) => in_array($permission, $user->admin_permissions, true));
        }

        ResetPassword::createUrlUsing(fn ($user, string $token) => rtrim((string) config('app.frontend_url'), '/')
            .'/reset-password#'.http_build_query([
                'token' => $token,
                'email' => $user->getEmailForPasswordReset(),
            ]));

        VerifyEmail::createUrlUsing(fn ($user) => URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            [
                'id' => $user->getKey(),
                'hash' => sha1($user->getEmailForVerification()),
            ]
        ));
        VerifyEmail::toMailUsing(fn ($user, string $url) => (new MailMessage)
            ->subject('Confirme seu email — Pruma Essential')
            ->greeting('Olá, '.$user->name)
            ->line('Confirme este endereço para liberar as compras na sua conta.')
            ->action('Confirmar email', $url)
            ->line('Este link expira em 60 minutos. Se você não criou a conta, ignore esta mensagem.'));

        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return [
                Limit::perMinute(5)->by($email.'|'.$request->ip()),
                Limit::perMinute(30)->by('ip|'.$request->ip()),
            ];
        });

        RateLimiter::for('register', fn (Request $request) => [
            Limit::perMinute(5)->by('register|'.$request->ip()),
        ]);

        RateLimiter::for('password-reset', fn (Request $request) => [
            Limit::perMinute(3)->by('password-reset|'.$request->ip()),
            Limit::perMinute(3)->by('password-reset-email|'.Str::lower((string) $request->input('email')).'|'.$request->ip()),
        ]);

        RateLimiter::for('email-verification', fn (Request $request) => [
            Limit::perMinute(5)->by('email-verification|'.$request->ip().'|'.$request->user()?->id),
        ]);

        RateLimiter::for('two-factor', fn (Request $request) => [
            Limit::perMinute(5)->by('two-factor|'.$request->ip().'|'.$request->session()->getId()),
            Limit::perMinute(10)->by('two-factor-ip|'.$request->ip()),
            Limit::perHour(30)->by('two-factor-admin|'.(
                $request->session()->get('admin_mfa_challenge_user_id')
                ?? $request->session()->get('admin_mfa_setup_user_id')
                ?? 'unknown'
            )),
        ]);

        RateLimiter::for('api', fn (Request $request) => [
            Limit::perMinute(120)->by('api|'.$request->ip()),
        ]);

        RateLimiter::for('checkout', fn (Request $request) => [
            Limit::perMinute(10)->by('checkout|'.$request->user()?->id.'|'.$request->ip()),
        ]);

        RateLimiter::for('mercado-pago-webhook', fn (Request $request) => [
            Limit::perMinute(120)->by('mercado-pago-webhook|'.$request->ip()),
        ]);

        RateLimiter::for('shipping', fn (Request $request) => [
            Limit::perMinute(10)->by('shipping|'.$request->ip()),
        ]);

        RateLimiter::for('postal-codes', fn (Request $request) => [
            Limit::perMinute(20)->by('postal-codes|'.$request->ip()),
        ]);

        RateLimiter::for('admin', fn (Request $request) => [
            Limit::perMinute(120)->by('admin|'.$request->user()?->id.'|'.$request->ip()),
        ]);
    }
}
