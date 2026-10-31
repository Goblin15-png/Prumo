<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
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
