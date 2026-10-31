<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminSystemController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
        } catch (\Throwable) {
            return response()->json(['api' => 'available', 'database' => 'unavailable'], 503);
        }

        // Não expor versões, credenciais, caminhos, configurações nem dados comerciais.
        return response()->json(['api' => 'available', 'database' => 'available']);
    }
}
