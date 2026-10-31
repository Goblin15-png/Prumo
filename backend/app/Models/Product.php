<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'category_id',
        'category_position',
        'name',
        'slug',
        'price',
        'stock',
        'shipping_width_cm',
        'shipping_height_cm',
        'shipping_length_cm',
        'shipping_weight_kg',
        'short_description',
        'therapeutic_description',
        'symptom_target',
        'images',
        'is_active',
        'sales_count',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'stock' => 'integer',
        'shipping_width_cm' => 'decimal:2',
        'shipping_height_cm' => 'decimal:2',
        'shipping_length_cm' => 'decimal:2',
        'shipping_weight_kg' => 'decimal:3',
        'is_active' => 'boolean',
        'images' => 'array',
        'sales_count' => 'integer',
        'category_position' => 'integer',
    ];

    public function symptoms(): BelongsToMany
    {
        return $this->belongsToMany(Symptom::class, 'product_symptom');
    }

    public function scopeTargetingSymptom(Builder $query, string $name): void
    {
        $query->where(function ($matching) use ($name) {
            $matching->whereHas('symptoms', fn ($symptoms) => $symptoms->where('name', $name))
                ->orWhere(fn ($legacy) => $legacy->doesntHave('symptoms')->where('symptom_target', $name));
        });
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'category_product')->withPivot('sort_order');
    }

    // Compatibilidade para consumidores antigos; as associações reais ficam na tabela pivô.
    public function syncLegacyCategory(): void
    {
        $category = $this->categories()->orderBy('categories.sort_order')->orderBy('categories.id')->first();
        $this->update(['category_id' => $category?->id, 'category_position' => $category?->pivot->sort_order ?? 0]);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function ingredients(): BelongsToMany
    {
        return $this->belongsToMany(Ingredient::class, 'product_ingredient')
            ->withPivot('percentage')
            ->withTimestamps();
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'product_tag')
            ->withTimestamps();
    }
}
