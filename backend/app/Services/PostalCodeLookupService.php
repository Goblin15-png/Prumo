<?php

namespace App\Services;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;

class PostalCodeLookupService
{
    public function __construct(
        private ViaCepPostalCodeService $viaCep,
        private CorreiosPostalCodeService $correios,
    ) {}

    public function find(string $postalCode): array
    {
        $provider = config('services.postal_code.provider');
        $service = match ($provider) {
            'viacep' => $this->viaCep,
            'correios' => $this->correios,
            default => throw new HttpResponseException(response()->json([
                'message' => 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
            ], 503)),
        };

        // Only public, validated address fields are cached. Exceptions are never cached.
        return Cache::remember('postal-code:v1:'.$provider.':'.$postalCode, now()->addDay(),
            fn () => $service->find($postalCode));
    }
}
