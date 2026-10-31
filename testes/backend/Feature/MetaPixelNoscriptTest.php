<?php

namespace Tests\Feature;

use Tests\TestCase;

class MetaPixelNoscriptTest extends TestCase
{
    private const ENDPOINT = '/api/v1/tracking/meta-pixel-noscript';
    private const PIXEL_URL = 'https://www.facebook.com/tr?id=1636298474539545&ev=PageView&noscript=1';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.frontend_url' => 'https://store.example.test']);
    }

    public function test_meta_consent_allows_only_fixed_pageview_even_with_google_rejected(): void
    {
        foreach (['meta-pixel-consent=accepted', 'meta-pixel-consent=accepted; google-tag-manager-consent=rejected'] as $cookies) {
            $this->withHeaders([
                'Referer' => 'https://store.example.test/produtos',
                'Cookie' => $cookies,
            ])->get('https://api.example.test'.self::ENDPOINT.'?id=other&ev=Purchase&destination=https://other.example')
                ->assertRedirect(self::PIXEL_URL)
                ->assertHeader('Cache-Control', 'no-store, private');
        }
    }

    public function test_first_visit_rejection_and_invalid_cookie_do_not_send_pixel(): void
    {
        foreach (['', 'meta-pixel-consent=rejected', 'meta-pixel-consent=invalid', 'google-tag-manager-consent=accepted', 'other-meta-pixel-consent=accepted'] as $cookies) {
            $this->withHeaders([
                'Referer' => 'https://store.example.test/',
                'Cookie' => $cookies,
            ])->get(self::ENDPOINT)->assertNoContent()->assertHeaderMissing('Location');
        }
    }

    public function test_admin_reset_untrusted_and_missing_referrer_cannot_send_pixel(): void
    {
        foreach ([
            'https://store.example.test/admin',
            'https://store.example.test/admin/pedidos',
            'https://store.example.test/reset-password',
            'https://store.example.test/reset-password/token',
            'https://other.example/',
            '',
        ] as $referrer) {
            $this->withHeaders([
                'Referer' => $referrer,
                'Cookie' => 'meta-pixel-consent=accepted',
            ])->get(self::ENDPOINT)->assertNoContent()->assertHeaderMissing('Location');
        }
    }

    public function test_unknown_tracker_is_not_supported(): void
    {
        $this->get('/api/v1/tracking/unknown-noscript')->assertNotFound();
    }
}
