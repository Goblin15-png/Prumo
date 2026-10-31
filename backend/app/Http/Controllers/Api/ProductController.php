<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    /**
     * Listagem completa do Catálogo Botânico com busca e filtros
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'tag' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1', 'max:10000'],
        ]);

        $query = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
            ->where('is_active', true);

        // Filtro por busca textual (nome ou descrição)
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('short_description', 'like', "%{$search}%")
                    ->orWhere('therapeutic_description', 'like', "%{$search}%")
                    ->orWhere('symptom_target', 'like', "%{$search}%")
                    ->orWhereHas('symptoms', fn ($symptoms) => $symptoms->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('tags', fn ($tags) => $tags->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('ingredients', fn ($ingredients) => $ingredients->where('name', 'like', "%{$search}%"));
            });
        }

        // Filtro por categoria (slug)
        if ($categorySlug = $request->query('category')) {
            $query->whereHas('categories', function ($q) use ($categorySlug) {
                $q->where('slug', $categorySlug);
            });
            $query->orderBy(DB::table('category_product')->select('category_product.sort_order')
                ->join('categories', 'categories.id', '=', 'category_product.category_id')
                ->whereColumn('category_product.product_id', 'products.id')
                ->where('categories.slug', $categorySlug)->limit(1));
        }

        // Filtro por tag
        if ($tagSlug = $request->query('tag')) {
            $query->whereHas('tags', function ($q) use ($tagSlug) {
                $q->where('slug', $tagSlug);
            });
        }

        $products = $query
            ->orderByRaw('(products.category_id IS NULL) asc')
            ->orderByRaw('(select sort_order from categories where categories.id = products.category_id) asc')
            ->orderBy('category_position')
            ->orderBy('products.id')
            ->paginate(100);

        return response()->json($products);
    }

    /**
     * Detalhes do Produto (usado no Quick View / Modal)
     */
    public function show(string $slug): JsonResponse
    {
        $product = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        return response()->json($product);
    }

    /**
     * Vitrine Dinâmica de Recomendados baseada em sintomas e tags
     */
    public function recommended(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user?->profile;
        $targetSymptom = $profile && $profile->hasHealthDataConsent()
            ? $profile->problema_principal
            : null;

        $query = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
            ->where('is_active', true)
            ->where('stock', '>', 0);

        if ($targetSymptom) {
            // Prioriza produtos com o symptom_target correspondente
            $query->where(function ($q) use ($targetSymptom) {
                $q->targetingSymptom($targetSymptom)
                    ->orWhereHas('tags', function ($sub) use ($targetSymptom) {
                        $sub->where('name', 'like', '%'.explode(' ', $targetSymptom)[0].'%');
                    });
            });
        }

        $products = $query->orderByDesc('sales_count')->limit(8)->get();

        // Se houver poucos produtos no alvo, complementa com os mais vendidos
        if ($products->count() < 4) {
            $existingIds = $products->pluck('id');
            $fallbacks = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
                ->where('is_active', true)
                ->where('stock', '>', 0)
                ->whereNotIn('id', $existingIds)
                ->orderByDesc('sales_count')
                ->limit(4 - $products->count())
                ->get();

            $products = $products->merge($fallbacks);
        }

        return response()->json([
            'symptom_target' => $targetSymptom,
            'products' => $products,
        ]);
    }
}
