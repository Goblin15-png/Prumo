<?php

namespace Tests\Feature;

use Illuminate\Database\PostgresConnection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

// Compila com o grammar PostgreSQL instalado; não abre conexão nem comprova execução no servidor.
class PostgresMigrationSqlTest extends TestCase
{
    private function migrationSql(string $file, string $direction): array
    {
        $default = DB::getDefaultConnection();
        $schema = Schema::getFacadeRoot();
        try {
            // O cursor de Connection não funciona em pretend(); retorna vazio sem consultar dados.
            $connection = new class(
                static fn () => throw new \LogicException('Este teste não pode conectar a um banco.'),
                'sql_compilation_only', '', config('database.connections.pgsql'),
            ) extends PostgresConnection {
                public function cursor($query, $bindings = [], $useReadPdo = true)
                {
                    return new \EmptyIterator();
                }
            };
            DB::purge('pgsql');
            DB::extend('pgsql', fn () => $connection);
            DB::setDefaultConnection('pgsql');
            $connection = DB::connection('pgsql');
            Schema::swap($connection->getSchemaBuilder());
            $migration = require database_path('migrations/'.$file);

            return array_column($connection->pretend(fn () => $migration->{$direction}()), 'query');
        } finally {
            DB::setDefaultConnection($default);
            Schema::swap($schema);
        }
    }

    public function test_profile_encryption_removes_enum_check_before_changing_column(): void
    {
        $queries = $this->migrationSql('2026_10_12_000007_encrypt_user_profile_data.php', 'up');
        $sql = implode("\n", $queries);
        $drop = strpos($sql, 'DROP CONSTRAINT IF EXISTS "user_profiles_sexo_check"');
        $alter = strpos($sql, 'alter column "sexo" type text');
        $this->assertNotFalse($drop);
        $this->assertNotFalse($alter);
        $this->assertLessThan($alter, $drop, 'O CHECK precisa sair antes de salvar dados cifrados.');
    }

    public function test_profile_rollback_restores_check_and_casts_date_explicitly(): void
    {
        $sql = implode("\n", $this->migrationSql('2026_10_12_000007_encrypt_user_profile_data.php', 'down'));
        $this->assertStringContainsString('USING "data_nascimento"::date', $sql);
        $this->assertStringContainsString('ADD CONSTRAINT "user_profiles_sexo_check" CHECK', $sql);
        $this->assertDoesNotMatchRegularExpression('/alter column "sexo" type varchar\(255\) check/i', $sql);
    }

    public function test_payment_method_nullability_uses_valid_alter_type_and_preserves_check(): void
    {
        foreach (['up' => 'drop not null', 'down' => 'set not null'] as $direction => $expected) {
            $sql = implode("\n", $this->migrationSql('2026_10_12_000011_add_mercado_pago_checkout_fields.php', $direction));
            $this->assertStringContainsString('alter column "payment_method" '.$expected, $sql);
            $this->assertDoesNotMatchRegularExpression('/alter column "payment_method" type varchar\(255\) check/i', $sql);
            $this->assertStringNotContainsString('drop constraint "orders_payment_method_check"', strtolower($sql));
        }
    }
}
