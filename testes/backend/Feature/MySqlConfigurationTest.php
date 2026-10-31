<?php

namespace Tests\Feature;

use Tests\TestCase;

class MySqlConfigurationTest extends TestCase
{
    public function test_mysql_configuration_preserves_unicode_and_strict_mode(): void
    {
        $connection = config('database.connections.mysql');

        $this->assertSame('mysql', $connection['driver']);
        $this->assertSame('utf8mb4', $connection['charset']);
        $this->assertSame('utf8mb4_unicode_ci', $connection['collation']);
        $this->assertTrue($connection['strict']);
        $this->assertSame('', $connection['prefix']);
    }

    public function test_deployment_example_does_not_change_test_database(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->assertEmpty(config('database.connections.sqlite.url'));
    }

    public function test_mysql_verifies_server_certificate_when_driver_is_available(): void
    {
        if (! extension_loaded('pdo_mysql')) {
            $this->markTestSkipped('pdo_mysql não está instalado.');
        }

        $this->assertTrue(config('database.connections.mysql.options')[\PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT]);
    }
}
