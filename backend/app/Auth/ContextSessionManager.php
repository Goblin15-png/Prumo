<?php

namespace App\Auth;

use Illuminate\Session\SessionManager;

class ContextSessionManager extends SessionManager
{
    public function driver($driver = null)
    {
        return $this->forContext(SessionContext::forRequest($this->container['request']), $driver);
    }

    public function forContext(string $context, ?string $driver = null)
    {
        $driver ??= $this->getDefaultDriver();
        $key = $context.':'.$driver;
        if (! isset($this->drivers[$key])) {
            $this->drivers[$key] = $this->createDriver($driver);
            $this->drivers[$key]->setName(SessionContext::cookie($context));
        }

        return $this->drivers[$key];
    }
}
