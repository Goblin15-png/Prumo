<?php

namespace App\Services;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;
use Throwable;

class CorreiosPostalCodeService
{
    public function find(string $postalCode): array
    {
        $token = trim((string) config('services.correios.access_token'));
        if ($token === '') {
            $this->unavailable();
        }

        try {
            $response = Http::acceptJson()
                ->withToken($token)
                ->withoutRedirecting()
                ->connectTimeout(3)
                ->timeout(6)
                ->get('https://api.correios.com.br/cep/v2/enderecos', [
                    'cep' => $postalCode,
                    'size' => 2,
                ]);
        } catch (Throwable) {
            $this->unavailable();
        }

        if ($response->status() === 404) {
            $this->notFound();
        }
        if (! $response->successful()) {
            $this->unavailable();
        }

        $items = $response->json('itens');
        if (! is_array($items) || ! array_is_list($items)) {
            $this->unavailable();
        }
        if ($items === []) {
            $this->notFound();
        }

        // Never choose a different or ambiguous CEP from a provider response.
        if (count($items) !== 1 || (int) $response->json('page.totalElements', 1) !== 1
            || ! is_array($items[0]) || ($items[0]['cep'] ?? null) !== $postalCode) {
            $this->unavailable();
        }

        $item = $items[0];
        $state = $item['uf'] ?? null;
        $city = $item['localidade'] ?? null;
        if (! is_string($state) || ! preg_match('/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/', $state)
            || ! is_string($city) || trim($city) === '' || mb_strlen($city) > 100) {
            $this->unavailable();
        }

        $address = ['postal_code' => $postalCode, 'city' => trim($city), 'state' => $state];
        // A municipal CEP may have no street or neighborhood. The customer fills those in.
        foreach (['street' => ['logradouro', 150], 'neighborhood' => ['bairro', 100]] as $field => [$source, $limit]) {
            $value = $item[$source] ?? '';
            if (! is_string($value) || mb_strlen($value) > $limit) {
                $this->unavailable();
            }
            $address[$field] = trim($value);
        }

        // Provider complemento/numeroInicial describe postal ranges, not the customer's unit.
        return $address;
    }

    private function unavailable(): never
    {
        throw new HttpResponseException(response()->json([
            'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
        ], 503));
    }

    private function notFound(): never
    {
        throw new HttpResponseException(response()->json([
            'message' => 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.',
        ], 404));
    }
}
