<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'sexo',
        'data_nascimento',
        'numero_telefone',
        'problema_principal',
        'canal_aquisicao',
        'health_data_consented_at',
        'health_data_consent_version',
    ];

    protected $casts = [
        'sexo' => 'encrypted',
        'data_nascimento' => 'encrypted',
        'numero_telefone' => 'encrypted',
        'problema_principal' => 'encrypted',
        'canal_aquisicao' => 'encrypted',
        'health_data_consented_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeConsentedToHealthData(Builder $query): Builder
    {
        return $query->whereNotNull('health_data_consented_at');
    }

    public function hasHealthDataConsent(): bool
    {
        return $this->health_data_consented_at !== null;
    }
}
