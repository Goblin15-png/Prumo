<?php

namespace App\Services;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;
use Throwable;

class ViaCepPostalCodeService
{
    public function find(string $postalCode): array
    {
        try {
            $response = Http::acceptJson()
                ->withoutRedirecting()
                ->connectTimeout(3)
                ->timeout(6)
                ->get('https://viacep.com.br/ws/'.$postalCode.'/json/');
        } catch (Throwable) {
            $this->unavailable();
        }

        if ($response->status() === 404) {
            $this->notFound();
        }
        if (! $response->successful()) {
            $this->unavailable();
        }

        $item = $response->json();
        if (! is_array($item)) {
            $this->unavailable();
        }
        if (in_array($item['erro'] ?? null, [true, 'true'], true)) {
            $this->notFound();
        }
        $returnedCode = $item['cep'] ?? null;
        if (! is_string($returnedCode) || ! preg_match('/^[0-9]{5}-?[0-9]{3}$/D', $returnedCode)
            || str_replace('-', '', $returnedCode) !== $postalCode) {
            $this->unavailable();
        }

        $state = $item['uf'] ?? null;
        $city = $item['localidade'] ?? null;
        if (! is_string($state) || ! preg_match('/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/D', $state)
            || ! is_string($city) || trim($city) === '' || mb_strlen($city) > 100) {
            $this->unavailable();
        }

        $address = ['postal_code' => $postalCode, 'city' => trim($city), 'state' => $state];
        // Municipal CEPs may have no street or neighborhood. Keep manual input available.
        foreach (['street' => ['logradouro', 150], 'neighborhood' => ['bairro', 100]] as $field => [$source, $limit]) {
            $value = $item[$source] ?? '';
            if (! is_string($value) || mb_strlen($value) > $limit) {
                $this->unavailable();
            }
            $address[$field] = trim($value);
        }

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
