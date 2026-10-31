<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AssignAdminProfile extends Command
{
    protected $signature = 'admin:assign-profile {email} {profile : owner, technical ou none}';

    protected $description = 'Atribui explicitamente o perfil de um administrador existente e revoga suas sessões';

    public function handle(): int
    {
        $profile = $this->argument('profile');
        if (! in_array($profile, ['owner', 'technical', 'none'], true)) {
            $this->error('Perfil inválido. Use owner, technical ou none.');

            return self::FAILURE;
        }

        $user = User::where('email', $this->argument('email'))->where('role', 'admin')->first();
        if (! $user) {
            $this->error('Conta administrativa existente não encontrada. Nenhuma conta foi criada ou promovida.');

            return self::FAILURE;
        }

        if (! $this->confirm('Alterar o perfil deste administrador para '.$profile.' e revogar as sessões existentes?', false)) {
            return self::FAILURE;
        }

        DB::transaction(function () use ($user, $profile): void {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $previous = $locked->admin_profile ?? 'none';
            $locked->forceFill(['admin_profile' => $profile === 'none' ? null : $profile, 'remember_token' => null, 'admin_access_version' => $locked->admin_access_version + 1])->save();
            $locked->tokens()->delete();
            DB::table('sessions')->where('user_id', $locked->id)->delete();
            DB::table('security_audit_logs')->insert([
                // A ação parte do console do servidor, não de uma sessão de administrador web.
                'admin_user_id' => null,
                'action' => 'CLI admin-profile user:'.$locked->id.' '.$previous.'->'.$profile,
                'method' => 'CLI',
                'route' => 'console/admin:assign-profile',
                'status_code' => 200,
                'created_at' => now(),
            ]);
        });

        $this->info('Perfil atribuído. A conta deve entrar novamente e confirmar MFA.');

        return self::SUCCESS;
    }
}
