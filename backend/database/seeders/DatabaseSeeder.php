<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Nunca criar uma conta administrativa com credenciais conhecidas.
        // Configure ADMIN_EMAIL e ADMIN_PASSWORD fora do repositório.
        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');

        if (! $email || ! $password) {
            return;
        }

        if (strlen($password) < 12) {
            throw new \RuntimeException('ADMIN_PASSWORD precisa ter pelo menos 12 caracteres.');
        }

        User::firstOrCreate(
            ['email' => $email],
            [
                'name' => 'Administrador',
                'password' => $password,
                'role' => 'admin',
            ]
        );
    }
}
