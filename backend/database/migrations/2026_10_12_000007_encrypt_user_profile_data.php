<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const ENCRYPTED_COLUMNS = [
        'sexo',
        'data_nascimento',
        'numero_telefone',
        'problema_principal',
        'canal_aquisicao',
    ];

    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropIndex(['problema_principal']);
        });

        if (DB::getDriverName() === 'pgsql') {
            // No PostgreSQL, enum() cria um CHECK que impediria salvar o texto cifrado.
            DB::statement('ALTER TABLE "user_profiles" DROP CONSTRAINT IF EXISTS "user_profiles_sexo_check"');
        }

        Schema::table('user_profiles', function (Blueprint $table) {
            $table->text('sexo')->change();
            $table->text('data_nascimento')->nullable()->change();
            $table->text('numero_telefone')->nullable()->change();
            $table->text('problema_principal')->change();
            $table->text('canal_aquisicao')->nullable()->change();
        });

        DB::table('user_profiles')
            ->select(['id', ...self::ENCRYPTED_COLUMNS])
            ->orderBy('id')
            ->chunkById(200, function ($profiles): void {
                foreach ($profiles as $profile) {
                    $values = [];

                    foreach (self::ENCRYPTED_COLUMNS as $column) {
                        $value = $profile->{$column};
                        if ($value !== null) {
                            $values[$column] = $this->encryptUnlessAlreadyEncrypted((string) $value);
                        }
                    }

                    if ($values !== []) {
                        DB::table('user_profiles')->where('id', $profile->id)->update($values);
                    }
                }
            });
    }

    public function down(): void
    {
        DB::table('user_profiles')
            ->select(['id', ...self::ENCRYPTED_COLUMNS])
            ->orderBy('id')
            ->chunkById(200, function ($profiles): void {
                foreach ($profiles as $profile) {
                    $values = [];

                    foreach (self::ENCRYPTED_COLUMNS as $column) {
                        $value = $profile->{$column};
                        if ($value !== null) {
                            $values[$column] = Crypt::decryptString((string) $value);
                        }
                    }

                    if ($values !== []) {
                        DB::table('user_profiles')->where('id', $profile->id)->update($values);
                    }
                }
            });

        $postgres = DB::getDriverName() === 'pgsql';
        Schema::table('user_profiles', function (Blueprint $table) use ($postgres) {
            if ($postgres) {
                $table->string('sexo', 255)->change();
            } else {
                $table->enum('sexo', ['Masculino', 'Feminino', 'Outro', 'Prefiro não dizer'])->change();
                $table->date('data_nascimento')->nullable()->change();
            }
            $table->string('numero_telefone', 30)->nullable()->change();
            $table->string('problema_principal', 150)->change();
            $table->string('canal_aquisicao', 100)->nullable()->change();
            $table->index('problema_principal');
        });

        if ($postgres) {
            DB::statement('ALTER TABLE "user_profiles" ALTER COLUMN "data_nascimento" TYPE DATE USING "data_nascimento"::date');
            DB::statement('ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_sexo_check" CHECK ("sexo" IN (\'Masculino\', \'Feminino\', \'Outro\', \'Prefiro não dizer\'))');
        }
    }

    private function encryptUnlessAlreadyEncrypted(string $value): string
    {
        try {
            Crypt::decryptString($value);

            return $value;
        } catch (DecryptException) {
            return Crypt::encryptString($value);
        }
    }
};
