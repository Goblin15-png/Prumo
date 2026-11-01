<?php

namespace App\Models;

use App\Auth\AdminPermissions;
use Illuminate\Auth\MustVerifyEmail;
use Illuminate\Contracts\Auth\MustVerifyEmail as MustVerifyEmailContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmailContract
{
    use HasApiTokens, HasFactory, MustVerifyEmail, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
    ];

    protected $appends = ['admin_permissions'];

    public function getAdminPermissionsAttribute(): array
    {
        return AdminPermissions::forUser($this);
    }

    protected $hidden = [
        'password',
        'email_code_hash',
        'email_code_expires_at',
        'email_code_sent_at',
        'email_code_attempts',
        'remember_token',
        'admin_access_version',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'email_code_expires_at' => 'datetime',
        'email_code_sent_at' => 'datetime',
        'email_code_attempts' => 'integer',
        'password' => 'hashed',
        'two_factor_secret' => 'encrypted',
        'two_factor_recovery_codes' => 'encrypted:array',
        'two_factor_confirmed_at' => 'datetime',
        'two_factor_last_step' => 'integer',
        'password_reset_required' => 'boolean',
    ];

    public function sendEmailVerificationNotification(): void
    {
        app(\App\Services\EmailVerificationCodes::class)->send($this);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function profile(): HasOne
    {
        return $this->hasOne(UserProfile::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
