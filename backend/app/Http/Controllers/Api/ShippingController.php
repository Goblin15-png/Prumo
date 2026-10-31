<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ShippingQuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShippingController extends Controller
{
    public function __construct(protected ShippingQuoteService $shippingQuoteService) {}

    public function calculate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'postal_code' => ['required', 'string', 'regex:/^\d{5}-?\d{3}$/'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.product_id' => ['required', 'integer', 'distinct'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
        ]);

        return response()->json([
            'data' => $this->shippingQuoteService->calculate($validated['postal_code'], $validated['items']),
        ]);
    }
}
