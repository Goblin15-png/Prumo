<?php

namespace Tests\Feature;

use Tests\TestCase;

class GoogleTagManagerNoscriptTest extends TestCase
{
    private const ENDPOINT = '/api/v1/tracking/google-tag-manager-noscript';

    private const ACCEPTED_COOKIES = 'meta-pixel-consent=accepted; google-tag-manager-consent=accepted';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.frontend_url' => 'http://localhost']);
    }

    public function test_proxy_can_use_different_backend_host_without_accepting_other_frontends(): void
    {
        config(['app.frontend_url' => 'https://store.example.test']);
        $this->withHeaders([
            'Referer' => 'https://store.example.test/',
            'Cookie' => self::ACCEPTED_COOKIES,
        ])->get('https://api.example.test'.self::ENDPOINT)
            ->assertRedirect('https://www.googletagmanager.com/ns.html?id=GTM-5HTKMSRK');

        $this->withHeader('Referer', 'https://api.example.test/')
            ->get('https://api.example.test'.self::ENDPOINT)->assertNoContent();
    }

    public function test_redirects_to_fixed_container_only_with_both_consents_on_public_page(): void
    {
        $this->withHeaders([
            'Referer' => 'http://localhost/produtos',
            'Cookie' => self::ACCEPTED_COOKIES,
        ])->get(self::ENDPOINT)
            ->assertRedirect('https://www.googletagmanager.com/ns.html?id=GTM-5HTKMSRK')
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_denies_first_visit_rejection_and_partial_or_invalid_cookies(): void
    {
        foreach ([
            '',
            'meta-pixel-consent=accepted',
            'google-tag-manager-consent=accepted',
            'meta-pixel-consent=rejected; google-tag-manager-consent=accepted',
            'meta-pixel-consent=accepted; google-tag-manager-consent=rejected',
            'other-meta-pixel-consent=accepted; google-tag-manager-consent=accepted',
        ] as $cookies) {
            $this->withHeaders([
                'Referer' => 'http://localhost/',
                'Cookie' => $cookies,
            ])->get(self::ENDPOINT)->assertNoContent();
        }
    }

    public function test_denies_admin_reset_cross_origin_and_missing_referrer(): void
    {
        foreach ([
            'http://localhost/admin',
            'http://localhost/admin/pedidos',
            'http://localhost/reset-password',
            'http://localhost/reset-password/token',
            'https://another.example/',
            '',
        ] as $referrer) {
            $this->withHeaders([
                'Cookie' => self::ACCEPTED_COOKIES,
                'Referer' => $referrer,
            ])->get(self::ENDPOINT)->assertNoContent();
        }
    }
}
