<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PostalCodeLookupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class PostalCodeController extends Controller
{
    public function __invoke(string $cep, PostalCodeLookupService $postalCodes): JsonResponse
    {
        $validated = Validator::make(['postal_code' => $cep], [
            'postal_code' => ['required', 'string', 'regex:/^[0-9]{5}-?[0-9]{3}$/D'],
        ], ['postal_code.regex' => 'Informe um CEP com 8 dígitos.'])->validate();

        return response()->json($postalCodes->find(str_replace('-', '', $validated['postal_code'])));
    }
}
