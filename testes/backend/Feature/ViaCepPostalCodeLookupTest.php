<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ViaCepPostalCodeLookupTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.postal_code.provider' => 'viacep',
            'services.correios.access_token' => 'never-send-this-token-to-viacep',
        ]);
        Http::preventStrayRequests();
    }

    private function address(array $overrides = []): array
    {
        return array_replace([
            'cep' => '00000-000',
            'uf' => 'PA',
            'localidade' => 'Cidade Fictícia',
            'logradouro' => 'Rua Fictícia',
            'bairro' => 'Bairro Modelo',
            'complemento' => 'lado par',
            'unidade' => '',
            'ibge' => '0000000',
            'ddd' => '00',
            'numero' => 100,
        ], $overrides);
    }

    public function test_public_lookup_requires_no_credentials_and_returns_only_address_fields(): void
    {
        config(['services.correios.access_token' => '']);
        Http::fake(function ($request, $options) {
            $this->assertFalse($options['allow_redirects']);
            $this->assertSame(3, $options['connect_timeout']);
            $this->assertSame(6, $options['timeout']);

            return Http::response($this->address());
        });

        $this->getJson('/api/v1/postal-codes/00000-000')->assertOk()->assertExactJson([
            'postal_code' => '00000000',
            'street' => 'Rua Fictícia',
            'neighborhood' => 'Bairro Modelo',
            'city' => 'Cidade Fictícia',
            'state' => 'PA',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && $request->url() === 'https://viacep.com.br/ws/00000000/json/'
            && ! $request->hasHeader('Authorization'));
    }

    public function test_correios_credentials_are_never_shared_with_viacep(): void
    {
        Http::fake(fn () => Http::response($this->address()));
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk();
        Http::assertSent(fn ($request) => ! $request->hasHeader('Authorization')
            && ! str_contains($request->body(), 'never-send-this-token-to-viacep')
            && ! str_contains($request->url(), 'never-send-this-token-to-viacep'));
    }

    public function test_invalid_cep_and_cpf_do_not_reach_viacep(): void
    {
        foreach (['12345678909', '1234', '00000-0000', '00000--000', 'abcdefgh', '00000000%0A'] as $cep) {
            $this->getJson('/api/v1/postal-codes/'.$cep)->assertUnprocessable()->assertJsonValidationErrors('postal_code');
        }
        Http::assertNothingSent();
    }

    public function test_unknown_cep_accepts_both_documented_error_formats_and_http_not_found(): void
    {
        Http::fakeSequence()->push(['erro' => true])->push(['erro' => 'true'])->push(['details' => 'internal'], 404);
        for ($i = 0; $i < 3; $i++) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertNotFound()->assertExactJson([
                'message' => 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.',
            ]);
        }
        Http::assertSentCount(3);
    }

    public function test_http_failures_and_redirects_keep_manual_entry_without_exposing_provider_details(): void
    {
        $sequence = Http::fakeSequence();
        foreach ([400, 401, 403, 429, 500, 503, 302] as $status) {
            $sequence->push(['message' => 'upstream internal details'], $status, ['Location' => 'https://example.invalid']);
        }
        for ($i = 0; $i < 7; $i++) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503)->assertExactJson([
                'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
            ]);
        }
        Http::assertSentCount(7);
    }

    public function test_connection_failures_do_not_expose_exception_details_or_get_cached(): void
    {
        $requests = 0;
        Http::fake(function () use (&$requests) {
            if ($requests++ === 0) {
                throw new ConnectionException('internal connection details');
            }

            return Http::response($this->address());
        });
        $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503)->assertExactJson([
            'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
        ]);
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk();
        $this->assertSame(2, $requests);
    }

    public function test_malformed_or_mismatched_addresses_are_not_used(): void
    {
        $sequence = Http::fakeSequence();
        $responses = [
            'invalid json',
            [],
            [$this->address()],
            $this->address(['cep' => '00000-001']),
            $this->address(['cep' => 0]),
            $this->address(['cep' => '000--00000']),
            $this->address(['uf' => 'XX']),
            $this->address(['uf' => "PA\n"]),
            $this->address(['localidade' => '']),
            $this->address(['localidade' => str_repeat('x', 101)]),
            $this->address(['logradouro' => ['invalid']]),
            $this->address(['bairro' => str_repeat('x', 101)]),
        ];
        foreach ($responses as $response) {
            $sequence->push($response);
        }
        foreach ($responses as $response) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503);
        }
        Http::assertSentCount(count($responses));
    }

    public function test_municipal_cep_without_street_and_neighborhood_still_fills_city_and_state(): void
    {
        Http::fake(fn () => Http::response([
            'cep' => '00000000', 'uf' => 'PA', 'localidade' => 'Cidade Fictícia',
        ]));
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertExactJson([
            'postal_code' => '00000000', 'street' => '', 'neighborhood' => '',
            'city' => 'Cidade Fictícia', 'state' => 'PA',
        ]);
    }

    public function test_valid_addresses_are_cached_by_normalized_cep_for_one_day(): void
    {
        Http::fakeSequence()->push($this->address())->push($this->address(['logradouro' => 'Rua Atualizada']));
        $this->getJson('/api/v1/postal-codes/00000-000')->assertOk()->assertJsonPath('street', 'Rua Fictícia');
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertJsonPath('street', 'Rua Fictícia');
        Http::assertSentCount(1);
        $this->travel(25)->hours();
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertJsonPath('street', 'Rua Atualizada');
        Http::assertSentCount(2);
    }

    public function test_provider_selection_keeps_address_caches_separate_and_unknown_provider_fails_closed(): void
    {
        Http::fake([
            'https://viacep.com.br/*' => Http::response($this->address()),
            'https://api.correios.com.br/*' => Http::response(['itens' => [$this->address([
                'cep' => '00000000', 'logradouro' => 'Rua dos Correios Fictícia',
            ])]]),
        ]);
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertJsonPath('street', 'Rua Fictícia');
        config(['services.postal_code.provider' => 'correios']);
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertJsonPath('street', 'Rua dos Correios Fictícia');
        config(['services.postal_code.provider' => 'viacep']);
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertJsonPath('street', 'Rua Fictícia');
        config(['services.postal_code.provider' => 'https://example.invalid']);
        $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503);
        Http::assertSentCount(2);
    }
}
