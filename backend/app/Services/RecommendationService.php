<?php

namespace App\Services;

use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

class RecommendationService
{
    /**
     * Retorna produtos recomendados com base no perfil do utilizador
     */
    public function getRecommendationsForUser(User $user, int $limit = 6): Collection
    {
        $profile = $user->profile;

        if (! $profile || ! $profile->hasHealthDataConsent() || empty($profile->problema_principal)) {
            return $this->getFallbackBestSellers($limit);
        }

        $problem = trim((string) $profile->problema_principal);
        $terms = collect(preg_split('/[^\pL\pN]+/u', mb_strtolower($problem)) ?: [])
            ->filter(fn (string $term) => mb_strlen($term) >= 3)
            ->take(8);

        $products = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
            ->where('is_active', true)
            ->where('stock', '>', 0)
            ->where(function ($query) use ($problem, $terms) {
                $query->targetingSymptom($problem);

                if ($terms->isNotEmpty()) {
                    $query->orWhereHas('tags', function ($tagQuery) use ($terms) {
                        $tagQuery->where(function ($matchingTags) use ($terms) {
                            foreach ($terms as $term) {
                                $matchingTags->orWhere('name', 'like', '%'.$term.'%');
                            }
                        });
                    });
                }
            })
            ->orderByDesc('sales_count')
            ->limit($limit)
            ->get();

        if ($products->count() < $limit) {
            $needed = $limit - $products->count();
            $existingIds = $products->modelKeys();

            $fallback = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
                ->where('is_active', true)
                ->where('stock', '>', 0)
                ->whereNotIn('id', $existingIds)
                ->orderByDesc('sales_count')
                ->limit($needed)
                ->get();

            $products = $products->merge($fallback);
        }

        return $products;
    }

    /**
     * Fallback para usuários não autenticados ou sem perfil cadastrado
     */
    public function getFallbackBestSellers(int $limit = 6): Collection
    {
        return Product::with(['category', 'categories', 'ingredients', 'symptoms'])
            ->where('is_active', true)
            ->where('stock', '>', 0)
            ->orderByDesc('sales_count')
            ->limit($limit)
            ->get();
    }
}
