<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

class StorefrontHostingTest extends TestCase
{
    private string $temporaryPublic;

    protected function setUp(): void
    {
        parent::setUp();
        $this->temporaryPublic = sys_get_temp_dir().'/pruma-storefront-'.bin2hex(random_bytes(8));
        File::makeDirectory($this->temporaryPublic);
        $this->app->usePublicPath($this->temporaryPublic);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->temporaryPublic);
        parent::tearDown();
    }

    public function test_store_admin_and_password_reset_serve_compiled_interface(): void
    {
        File::put(public_path('storefront.html'), '<!doctype html><title>Interface fictícia</title>');
        foreach (['/', '/admin', '/admin/catalogo', '/reset-password'] as $path) {
            $response = $this->get($path)->assertOk()->assertHeader('Content-Type', 'text/html; charset=UTF-8');
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
            $this->assertSame(public_path('storefront.html'), $response->baseResponse->getFile()->getPathname());
        }
    }

    public function test_missing_build_returns_service_error_without_serving_sources(): void
    {
        $this->get('/')->assertStatus(503);
    }

    public function test_api_static_and_private_paths_never_fall_back_to_storefront(): void
    {
        File::put(public_path('storefront.html'), 'INTERFACE-FICTICIA');
        foreach (['/api/v1/nonexistent', '/api', '/sanctum/nonexistent', '/assets/missing.js', '/.env', '/unknown-page'] as $path) {
            $this->getJson($path)->assertNotFound()->assertDontSee('INTERFACE-FICTICIA');
        }
    }

    public function test_password_reset_link_uses_the_configured_same_origin(): void
    {
        config(['app.frontend_url' => 'https://pruma.example.invalid']);
        $this->get('/reset-password/fake-token?email=buyer%40example.invalid')
            ->assertRedirect('https://pruma.example.invalid/reset-password#token=fake-token&email=buyer%40example.invalid');
    }
}
