<?php

return [

    // Simula frete e checkout somente quando APP_ENV=local.
    'local_test_mode' => (bool) env('LOCAL_TEST_MODE', false),

    'pickup' => [
        'enabled' => (bool) env('STORE_PICKUP_ENABLED', false),
        'instructions' => env('STORE_PICKUP_INSTRUCTIONS', ''),
    ],

    'postal_code' => [
        'provider' => env('POSTAL_CODE_PROVIDER', 'viacep'),
    ],

    'correios' => [
        'access_token' => env('CORREIOS_ACCESS_TOKEN'),
    ],

    'melhor_envio' => [
        'token' => env('MELHOR_ENVIO_TOKEN'),
        'origin_cep' => env('STORE_ORIGIN_CEP'),
        'environment' => env('MELHOR_ENVIO_ENVIRONMENT', 'sandbox'),
        'user_agent' => env('MELHOR_ENVIO_USER_AGENT', 'Pruma Essential (suporte@seudominio.com.br)'),
    ],

    'mercado_pago' => [
        'access_token' => env('MERCADO_PAGO_ACCESS_TOKEN'),
        'public_key' => env('MERCADO_PAGO_PUBLIC_KEY'),
        'webhook_secret' => env('MERCADO_PAGO_WEBHOOK_SECRET'),
        'environment' => env('MERCADO_PAGO_ENVIRONMENT', 'sandbox'),
        'webhook_url' => env('MERCADO_PAGO_WEBHOOK_URL'),
    ],

    'gemini' => [
        'key' => env('ANDROMEDA_GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-2.5-flash'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
