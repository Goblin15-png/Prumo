<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CreateAdmin extends Command
{
    protected $signature = 'admin:create {email : Email individual do administrador} {profile : owner ou technical}';

    protected $description = 'Cria uma conta administrativa individual com senha oculta e MFA obrigatório no primeiro acesso';

    public function handle(): int
    {
        if (! $this->input->isInteractive()) {
            $this->error('Execute em um terminal interativo para informar a senha oculta e confirmar a criação.');

            return self::FAILURE;
        }

        $email = Str::lower(trim((string) $this->argument('email')));
        $profile = $this->argument('profile');
        $identity = Validator::make(compact('email', 'profile'), [
            'email' => ['required', 'string', 'email', 'max:255'],
            'profile' => ['required', Rule::in(['owner', 'technical'])],
        ], [
            'email.*' => 'Informe um email válido com até 255 caracteres.',
            'profile.*' => 'Perfil inválido. Use owner ou technical.',
        ]);
        if ($identity->fails()) {
            foreach ($identity->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        if (User::whereRaw('LOWER(email) = ?', [$email])->exists()) {
            $this->error('Este email já pertence a uma conta. Nenhuma conta foi alterada ou promovida.');

            return self::FAILURE;
        }

        $name = trim((string) $this->ask('Nome completo do administrador'));
        // Sem fallback: se o terminal não ocultar a entrada, não exibir a senha.
        $password = $this->secret('Senha (12 a 128 caracteres)', false);
        $confirmation = $this->secret('Confirme a senha', false);
        $credentials = Validator::make([
            'name' => $name,
            'password' => $password,
            'password_confirmation' => $confirmation,
        ], [
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:12', 'max:128', 'confirmed'],
        ], [
            'name.*' => 'Informe o nome do responsável com até 255 caracteres.',
            'password.confirmed' => 'As senhas não conferem.',
            'password.*' => 'A senha deve ter de 12 a 128 caracteres.',
        ]);
        if ($credentials->fails()) {
            foreach ($credentials->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $this->line('Ambiente configurado: '.app()->environment());
        if (! $this->confirm('Criar a conta administrativa '.$email.' com perfil '.$profile.' neste banco?', false)) {
            return self::FAILURE;
        }

        try {
            DB::transaction(function () use ($name, $email, $password, $profile): void {
                $user = new User([
                    'name' => $name,
                    'email' => $email,
                    'password' => $password,
                    'role' => 'admin',
                ]);
                $user->forceFill(['admin_profile' => $profile, 'password_reset_required' => false])->save();
                DB::table('security_audit_logs')->insert([
                    // O operador do console é identificado pela infraestrutura, não por uma sessão web.
                    'admin_user_id' => null,
                    'action' => 'CLI admin-create user:'.$user->id.' profile:'.$profile,
                    'method' => 'CLI',
                    'route' => 'console/admin:create',
                    'status_code' => 201,
                    'created_at' => now(),
                ]);
            });
        } catch (QueryException) {
            // Não imprimir SQL/bindings, que podem conter dados da conta ou o hash da senha.
            $this->error('Não foi possível criar a conta e sua auditoria. Nenhuma conta foi criada. Confira o banco e se o email já está em uso.');

            return self::FAILURE;
        }

        $this->info('Conta administrativa criada. Acesse /admin, entre com sua senha e configure o autenticador.');

        return self::SUCCESS;
    }
}
