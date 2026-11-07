<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    // Falha antes do INSERT sem DDL, que faria commit implícito no MySQL.
    protected function failInsertsTo(string $table): \Closure
    {
        $enabled = true;
        \Illuminate\Support\Facades\DB::connection()->beforeExecuting(
            static function ($query, $bindings, $connection) use ($table, &$enabled): void {
                if ($enabled && preg_match('/^insert\\s+into\\s+[`"]?'.preg_quote($table, '/').'[`"]?\\s/i', $query)) {
                    throw new \Illuminate\Database\QueryException(
                        $connection->getName(), $query, $bindings, new \PDOException('audit unavailable'),
                    );
                }
            },
        );

        return static function () use (&$enabled): void {
            $enabled = false;
        };
    }

    protected function withAdminSession(array $data): static
    {
        $session = $this->app['session']->forContext('admin');
        if (! $session->isStarted()) {
            $session->start();
        }
        $session->put($data);

        return $this;
    }
}
