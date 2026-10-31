<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderFulfillmentEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['admin_user_id', 'from_status', 'to_status', 'from_tracking_code', 'to_tracking_code', 'revision'];

    protected $casts = ['revision' => 'integer'];

    public function administrator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }
}
