<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PostalCodeLookupTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.postal_code.provider' => 'correios',
            'services.correios.access_token' => 'fake-delegated-token',
        ]);
        Http::preventStrayRequests();
    }

    private function address(array $overrides = []): array
    {
        return array_replace([
            'cep' => '00000000',
            'uf' => 'PA',
            'localidade' => 'Cidade Fictícia',
            'logradouro' => 'Rua Fictícia',
            'bairro' => 'Bairro Modelo',
            'complemento' => '- lado par',
            'numeroInicial' => 2,
            'numeroFinal' => 98,
        ], $overrides);
    }

    public function test_lookup_is_public_normalizes_cep_and_returns_only_address_fields(): void
    {
        Http::fake(function ($request, $options) {
            $this->assertFalse($options['allow_redirects']);
            $this->assertSame(3, $options['connect_timeout']);
            $this->assertSame(6, $options['timeout']);

            return Http::response(['itens' => [$this->address()]]);
        });

        $this->getJson('/api/v1/postal-codes/00000-000')->assertOk()->assertExactJson([
            'postal_code' => '00000000',
            'street' => 'Rua Fictícia',
            'neighborhood' => 'Bairro Modelo',
            'city' => 'Cidade Fictícia',
            'state' => 'PA',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && $request->url() === 'https://api.correios.com.br/cep/v2/enderecos?cep=00000000&size=2'
            && $request->hasHeader('Authorization', 'Bearer fake-delegated-token'));
        $this->assertStringNotContainsString('fake-delegated-token', $this->getJson('/api/v1/runtime-config')->getContent());
    }

    public function test_invalid_cep_or_cpf_never_reaches_provider(): void
    {
        foreach (['12345678909', '1234', '00000-0000', '00000--000', 'abcdefgh', '00000000%0A'] as $cep) {
            $this->getJson('/api/v1/postal-codes/'.$cep)->assertUnprocessable()->assertJsonValidationErrors('postal_code');
        }
        Http::assertNothingSent();
    }

    public function test_missing_credentials_keeps_manual_entry_available_without_external_calls(): void
    {
        config(['services.correios.access_token' => '']);
        $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503)->assertExactJson([
            'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
        ]);
        Http::assertNothingSent();
    }

    public function test_unknown_cep_has_a_not_found_response(): void
    {
        Http::fakeSequence()->push(['itens' => []])->push(['upstream' => 'secret error details'], 404);
        for ($i = 0; $i < 2; $i++) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertNotFound()->assertExactJson([
                'message' => 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.',
            ]);
        }
    }

    public function test_provider_authorization_errors_redirects_and_failures_do_not_expose_details(): void
    {
        $sequence = Http::fakeSequence();
        foreach ([401, 403, 429, 500, 503, 302] as $status) {
            $sequence->push(['message' => 'fake-delegated-token upstream details'], $status, ['Location' => 'https://example.invalid']);
        }
        for ($i = 0; $i < 6; $i++) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503)->assertExactJson([
                'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
            ]);
        }
    }

    public function test_connection_failure_has_the_same_manual_entry_fallback(): void
    {
        Http::fake(fn () => throw new ConnectionException('fake-delegated-token connection details'));
        $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503)->assertExactJson([
            'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
        ]);
    }

    public function test_municipal_cep_can_omit_street_and_neighborhood(): void
    {
        Http::fake(fn () => Http::response(['itens' => [[
            'cep' => '00000000', 'uf' => 'PA', 'localidade' => 'Cidade Fictícia',
        ]]]));
        $this->getJson('/api/v1/postal-codes/00000000')->assertOk()->assertExactJson([
            'postal_code' => '00000000', 'street' => '', 'neighborhood' => '',
            'city' => 'Cidade Fictícia', 'state' => 'PA',
        ]);
    }

    public function test_malformed_mismatched_and_ambiguous_addresses_are_never_used(): void
    {
        $sequence = Http::fakeSequence();
        foreach ([
            [],
            ['itens' => ['cep' => '00000000']],
            ['itens' => [$this->address(['cep' => '00000001'])]],
            ['itens' => [$this->address(), $this->address()]],
            ['itens' => [$this->address()], 'page' => ['totalElements' => 2]],
            ['itens' => [$this->address(['uf' => 'XX'])]],
            ['itens' => [$this->address(['localidade' => ''])]],
            ['itens' => [$this->address(['logradouro' => ['invalid']])]],
        ] as $response) {
            $sequence->push($response);
        }
        for ($i = 0; $i < 8; $i++) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertStatus(503);
        }
    }

    public function test_lookup_rate_limit_is_applied_before_external_request(): void
    {
        Http::fake(fn () => Http::response(['itens' => [$this->address()]]));
        for ($i = 0; $i < 20; $i++) {
            $this->getJson('/api/v1/postal-codes/00000000')->assertOk();
        }
        $this->getJson('/api/v1/postal-codes/00000000')->assertTooManyRequests();
        Http::assertSentCount(1);
    }
}
