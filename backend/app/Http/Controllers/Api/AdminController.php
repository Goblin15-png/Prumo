<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Ingredient;
use App\Models\Product;
use App\Models\Symptom;
use App\Models\Tag;
use App\Models\UserProfile;
use App\Services\AudienceMetricsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminController extends Controller
{
    /**
     * Lista todos os produtos para a gestão do lojista (inclusive inativos)
     */
    public function indexProducts(): JsonResponse
    {
        $products = Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
            ->orderByRaw('(products.category_id IS NULL) asc')
            ->orderByRaw('(select sort_order from categories where categories.id = products.category_id) asc')
            ->orderBy('category_position')->orderByDesc('id')
            ->get();

        $categories = Category::all();
        $ingredients = Ingredient::all();
        $tags = Tag::all();

        return response()->json([
            'products' => $products,
            'categories' => $categories,
            'ingredients' => $ingredients,
            'tags' => $tags,
        ]);
    }

    public function taxonomy(): JsonResponse
    {
        return response()->json([
            'tags' => Tag::orderBy('name')->get(),
            'symptoms' => Symptom::orderBy('name')->get(),
            'categories' => Category::orderBy('name')->get(),
            'ingredients' => Ingredient::orderBy('name')->get(),
        ]);
    }

    public function storeIngredient(Request $request): JsonResponse
    {
        $request->merge(['name' => trim((string) $request->input('name', ''))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:ingredients,name'],
            'benefits' => ['nullable', 'string', 'max:5000'],
        ]);

        $ingredient = Ingredient::create([
            'name' => $data['name'],
            'benefits' => isset($data['benefits']) ? trim($data['benefits']) : null,
        ]);

        return response()->json(['ingredient' => $ingredient], 201);
    }

    public function indexCategories(): JsonResponse
    {
        return response()->json([
            'categories' => Category::with(['products'])
                ->orderBy('sort_order')->orderBy('id')->get(),
            'products' => Product::with(['category', 'categories', 'ingredients', 'tags', 'symptoms'])
                ->orderByRaw('(products.category_id IS NULL) asc')
                ->orderByRaw('(select sort_order from categories where categories.id = products.category_id) asc')
                ->orderBy('category_position')->orderBy('products.id')->get(),
        ]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100', 'unique:categories,name']]);
        $slug = $this->uniqueCategorySlug($data['name']);
        $category = Category::create([
            'name' => trim($data['name']),
            'slug' => $slug,
            'sort_order' => (int) Category::max('sort_order') + 1,
            'active' => true,
        ]);

        return response()->json(['category' => $category->load('products')], 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = Category::findOrFail($id);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('categories', 'name')->ignore($category->id)],
        ]);
        $category->update([
            'name' => trim($data['name']),
            'slug' => $this->uniqueCategorySlug($data['name'], $category->id),
        ]);

        return response()->json(['category' => $category->fresh()->load('products')]);
    }

    public function deleteCategory(int $id): JsonResponse
    {
        $category = Category::findOrFail($id);
        DB::transaction(function () use ($category): void {
            $products = $category->products()->get();
            $category->delete();
            foreach ($products as $product) {
                $product->syncLegacyCategory();
            }
        });

        return response()->json(['message' => 'Categoria removida; produtos e vínculos com outras categorias foram mantidos.']);
    }

    public function reorderCategories(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category_ids' => ['required', 'array', 'max:500'],
            'category_ids.*' => ['required', 'integer', 'distinct', 'exists:categories,id'],
        ]);
        if (count($data['category_ids']) !== Category::count()) {
            throw ValidationException::withMessages(['category_ids' => 'A lista precisa conter todas as categorias.']);
        }

        DB::transaction(function () use ($data) {
            foreach ($data['category_ids'] as $position => $id) {
                Category::whereKey($id)->update(['sort_order' => $position]);
            }
        });

        return response()->json(['message' => 'Ordem das categorias salva.']);
    }

    public function assignProductsToCategory(Request $request, int $id): JsonResponse
    {
        $category = Category::findOrFail($id);
        $data = $request->validate([
            'product_ids' => ['required', 'array', 'min:1', 'max:500'],
            'product_ids.*' => ['required', 'integer', 'distinct', 'exists:products,id'],
        ]);

        DB::transaction(function () use ($category, $data): void {
            Category::whereKey($category->id)->lockForUpdate()->firstOrFail();
            $existing = $category->products()->pluck('products.id')->all();
            $position = (int) DB::table('category_product')->where('category_id', $category->id)->max('sort_order') + 1;
            foreach ($data['product_ids'] as $productId) {
                if (! in_array((int) $productId, $existing, true)) {
                    $category->products()->attach($productId, ['sort_order' => $position++]);
                }
                Product::findOrFail($productId)->syncLegacyCategory();
            }
        });

        return response()->json(['category' => $category->fresh()->load('products')]);
    }

    public function removeProductFromCategory(int $id, int $productId): JsonResponse
    {
        $category = Category::findOrFail($id);
        $product = Product::findOrFail($productId);
        DB::transaction(function () use ($category, $product): void {
            Category::whereKey($category->id)->lockForUpdate()->firstOrFail();
            $category->products()->detach($product->id);
            $product->syncLegacyCategory();
        });

        return response()->json(['message' => 'Produto removido somente desta categoria.']);
    }

    public function reorderCategoryProducts(Request $request, int $id): JsonResponse
    {
        $category = Category::findOrFail($id);
        $data = $request->validate([
            'product_ids' => ['present', 'array', 'max:500'],
            'product_ids.*' => ['required', 'integer', 'distinct', 'exists:products,id'],
        ]);
        DB::transaction(function () use ($category, $data): void {
            Category::whereKey($category->id)->lockForUpdate()->firstOrFail();
            $actualIds = $category->products()->pluck('products.id')->map(fn ($id) => (int) $id)->all();
            if (count($actualIds) !== count($data['product_ids']) || array_diff($actualIds, $data['product_ids'])) {
                throw ValidationException::withMessages(['product_ids' => 'A lista precisa conter todos os produtos desta categoria.']);
            }
            foreach ($data['product_ids'] as $position => $productId) {
                $category->products()->updateExistingPivot($productId, ['sort_order' => $position]);
                Product::findOrFail($productId)->syncLegacyCategory();
            }
        });

        return response()->json(['message' => 'Ordem dos produtos salva nesta categoria.']);
    }

    private function uniqueCategorySlug(string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name) ?: 'categoria';
        $slug = $base;
        $suffix = 2;
        while (Category::where('slug', $slug)->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))->exists()) {
            $slug = $base.'-'.$suffix++;
        }

        return $slug;
    }

    public function storeTag(Request $request): JsonResponse
    {
        $normalizedName = ltrim(trim((string) $request->input('name', '')), '#');
        $request->merge(['name' => $normalizedName === '' ? '' : '#'.$normalizedName]);
        $data = $request->validate(['name' => ['required', 'string', 'max:100', 'unique:tags,name']]);
        $name = ltrim($data['name'], '#');
        $slug = Str::slug($name);
        if (Tag::where('slug', $slug)->exists()) {
            $slug .= '-'.Str::lower(Str::random(5));
        }
        $tag = Tag::create(['name' => '#'.$name, 'slug' => $slug]);

        return response()->json(['tag' => $tag], 201);
    }

    public function updateTag(Request $request, int $id): JsonResponse
    {
        $tag = Tag::findOrFail($id);
        $normalizedName = ltrim(trim((string) $request->input('name', '')), '#');
        $request->merge(['name' => $normalizedName === '' ? '' : '#'.$normalizedName]);
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('tags', 'name')->ignore($tag->id)]]);
        $name = ltrim($data['name'], '#');
        $slug = Str::slug($name);
        if (Tag::where('slug', $slug)->where('id', '!=', $tag->id)->exists()) {
            $slug .= '-'.$tag->id;
        }
        $tag->update(['name' => '#'.$name, 'slug' => $slug]);

        return response()->json(['tag' => $tag]);
    }

    public function deleteTag(int $id): JsonResponse
    {
        Tag::findOrFail($id)->delete();

        return response()->json(['message' => 'Tag removida.']);
    }

    public function storeSymptom(Request $request): JsonResponse
    {
        $request->merge(['name' => trim((string) $request->input('name', ''))]);
        $data = $request->validate(['name' => ['required', 'string', 'max:150', 'unique:symptoms,name']]);

        return response()->json(['symptom' => Symptom::create(['name' => trim($data['name'])])], 201);
    }

    public function updateSymptom(Request $request, int $id): JsonResponse
    {
        $symptom = Symptom::findOrFail($id);
        $request->merge(['name' => trim((string) $request->input('name', ''))]);
        $data = $request->validate(['name' => ['required', 'string', 'max:150', Rule::unique('symptoms', 'name')->ignore($symptom->id)]]);
        $oldName = $symptom->name;
        $newName = trim($data['name']);

        DB::transaction(function () use ($symptom, $oldName, $newName) {
            $symptom->update(['name' => $newName]);
            Product::where('symptom_target', $oldName)->update(['symptom_target' => $newName]);

            UserProfile::query()
                ->consentedToHealthData()
                ->select(['id', 'problema_principal'])
                ->chunkById(200, function ($profiles) use ($oldName, $newName): void {
                    foreach ($profiles as $profile) {
                        if ($profile->problema_principal === $oldName) {
                            $profile->problema_principal = $newName;
                            $profile->save();
                        }
                    }
                });
        });

        return response()->json(['symptom' => $symptom->fresh()]);
    }

    public function deleteSymptom(int $id): JsonResponse
    {
        $symptom = Symptom::findOrFail($id);
        DB::transaction(function () use ($symptom): void {
            $products = Product::where('symptom_target', $symptom->name)->get();
            $symptom->delete();
            foreach ($products as $product) {
                $product->update(['symptom_target' => $product->symptoms()->orderBy('symptoms.id')->value('name')]);
            }
        });

        return response()->json(['message' => 'Sintoma removido das opções de cadastro.']);
    }

    /**
     * Cadastro de novo produto com ingredientes, porcentagens e tags
     */
    public function storeProduct(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'price' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
            'stock' => ['required', 'integer', 'min:0', 'max:1000000'],
            'shipping_width_cm' => ['nullable', 'numeric', 'gt:0', 'lte:500'],
            'shipping_height_cm' => ['nullable', 'numeric', 'gt:0', 'lte:500'],
            'shipping_length_cm' => ['nullable', 'numeric', 'gt:0', 'lte:500'],
            'shipping_weight_kg' => ['nullable', 'numeric', 'gt:0', 'lte:1000'],
            'short_description' => ['nullable', 'string', 'max:2000'],
            'therapeutic_description' => ['nullable', 'string', 'max:20000'],
            'symptom_target' => ['nullable', 'string', 'max:150'],
            'category_id' => ['prohibited'],
            'category' => ['prohibited'],
            'category_ids' => ['prohibited'],
            'categories' => ['prohibited'],
            'symptom_ids' => ['array', 'max:50'],
            'symptom_ids.*' => ['required', 'integer', 'distinct', 'exists:symptoms,id'],
            'images' => ['nullable', 'array', 'max:8'],
            'images.*' => ['required', 'string', 'max:2048', 'url:https'],
            'is_active' => ['boolean'],
            'tags' => ['array', 'max:50'],
            'tags.*' => ['integer', 'distinct', 'exists:tags,id'],
            'ingredients' => ['array', 'max:100'],
            'ingredients.*.id' => ['required', 'integer', 'distinct', 'exists:ingredients,id'],
            'ingredients.*.percentage' => ['nullable', 'string', 'max:50'],
        ]);

        $slug = Str::slug($validated['name']).'-'.Str::random(4);

        $product = Product::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'price' => $validated['price'],
            'stock' => $validated['stock'],
            'shipping_width_cm' => $validated['shipping_width_cm'] ?? null,
            'shipping_height_cm' => $validated['shipping_height_cm'] ?? null,
            'shipping_length_cm' => $validated['shipping_length_cm'] ?? null,
            'shipping_weight_kg' => $validated['shipping_weight_kg'] ?? null,
            'short_description' => $validated['short_description'] ?? null,
            'therapeutic_description' => $validated['therapeutic_description'] ?? null,
            'symptom_target' => $validated['symptom_target'] ?? null,
            'images' => $validated['images'] ?? [],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->syncProductSymptoms($product, $validated);

        // Associa Tags
        if (! empty($validated['tags'])) {
            $product->tags()->sync($validated['tags']);
        }

        // Associa Ingredientes com Porcentagens
        if (! empty($validated['ingredients'])) {
            $pivotData = [];
            foreach ($validated['ingredients'] as $item) {
                if (isset($item['id'])) {
                    $pivotData[$item['id']] = ['percentage' => $item['percentage'] ?? ''];
                }
            }
            $product->ingredients()->sync($pivotData);
        }

        return response()->json([
            'message' => 'Produto botânico cadastrado com sucesso!',
            'product' => $product->load(['category', 'categories', 'ingredients', 'tags', 'symptoms']),
        ], 201);
    }

    /**
     * Atualização completa de produto
     */
    public function updateProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'price' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
            'stock' => ['required', 'integer', 'min:0', 'max:1000000'],
            'shipping_width_cm' => ['nullable', 'numeric', 'gt:0', 'lte:500'],
            'shipping_height_cm' => ['nullable', 'numeric', 'gt:0', 'lte:500'],
            'shipping_length_cm' => ['nullable', 'numeric', 'gt:0', 'lte:500'],
            'shipping_weight_kg' => ['nullable', 'numeric', 'gt:0', 'lte:1000'],
            'short_description' => ['nullable', 'string', 'max:2000'],
            'therapeutic_description' => ['nullable', 'string', 'max:20000'],
            'symptom_target' => ['nullable', 'string', 'max:150'],
            'category_id' => ['prohibited'],
            'category' => ['prohibited'],
            'category_ids' => ['prohibited'],
            'categories' => ['prohibited'],
            'symptom_ids' => ['array', 'max:50'],
            'symptom_ids.*' => ['required', 'integer', 'distinct', 'exists:symptoms,id'],
            'images' => ['nullable', 'array', 'max:8'],
            'images.*' => ['required', 'string', 'max:2048', 'url:https'],
            'is_active' => ['boolean'],
            'tags' => ['array', 'max:50'],
            'tags.*' => ['integer', 'distinct', 'exists:tags,id'],
            'ingredients' => ['array', 'max:100'],
            'ingredients.*.id' => ['required', 'integer', 'distinct', 'exists:ingredients,id'],
            'ingredients.*.percentage' => ['nullable', 'string', 'max:50'],
        ]);

        $product->update([
            'name' => $validated['name'],
            'price' => $validated['price'],
            'stock' => $validated['stock'],
            'shipping_width_cm' => $validated['shipping_width_cm'] ?? null,
            'shipping_height_cm' => $validated['shipping_height_cm'] ?? null,
            'shipping_length_cm' => $validated['shipping_length_cm'] ?? null,
            'shipping_weight_kg' => $validated['shipping_weight_kg'] ?? null,
            'short_description' => $validated['short_description'] ?? null,
            'therapeutic_description' => $validated['therapeutic_description'] ?? null,
            'symptom_target' => array_key_exists('symptom_target', $validated) ? $validated['symptom_target'] : $product->symptom_target,
            'images' => $validated['images'] ?? [],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->syncProductSymptoms($product, $validated);

        if (isset($validated['tags'])) {
            $product->tags()->sync($validated['tags']);
        }

        if (isset($validated['ingredients'])) {
            $pivotData = [];
            foreach ($validated['ingredients'] as $item) {
                if (isset($item['id'])) {
                    $pivotData[$item['id']] = ['percentage' => $item['percentage'] ?? ''];
                }
            }
            $product->ingredients()->sync($pivotData);
        }

        return response()->json([
            'message' => 'Produto atualizado com sucesso!',
            'product' => $product->load(['category', 'categories', 'ingredients', 'tags', 'symptoms']),
        ]);
    }

    private function syncProductSymptoms(Product $product, array $data): void
    {
        if (array_key_exists('symptom_ids', $data)) {
            $product->symptoms()->sync($data['symptom_ids']);
            $first = $data['symptom_ids'][0] ?? null;
            $product->update(['symptom_target' => $first ? Symptom::findOrFail($first)->name : null]);
        } elseif (array_key_exists('symptom_target', $data)) {
            $ids = Symptom::where('name', $data['symptom_target'])->pluck('id')->all();
            $product->symptoms()->sync($ids);
        }
    }

    /**
     * Alteração rápida de estoque e ativação
     */
    public function updateStock(Request $request, int $id): JsonResponse
    {
        $product = Product::findOrFail($id);

        $validated = $request->validate([
            'stock' => ['required', 'integer', 'min:0', 'max:1000000'],
            'is_active' => ['required', 'boolean'],
        ]);

        $product->update($validated);

        return response()->json([
            'message' => 'Estoque e status atualizados!',
            'product' => $product,
        ]);
    }

    /**
     * Excluir produto
     */
    public function deleteProduct(int $id): JsonResponse
    {
        $product = Product::findOrFail($id);
        $product->delete();

        return response()->json([
            'message' => 'Produto removido com sucesso.',
        ]);
    }

    /**
     * Painel de Informações & Métricas de Saúde (Dores Relatadas & Demandas)
     */
    public function healthMetrics(AudienceMetricsService $metrics): JsonResponse
    {
        return response()->json($metrics->report());
    }
}
