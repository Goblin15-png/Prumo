<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use HasFactory;

    public const DELIVERY_STATUSES = ['confirmed', 'preparing', 'shipped', 'delivered'];

    public const PICKUP_STATUSES = ['confirmed', 'preparing', 'ready_for_pickup', 'collected'];

    protected $fillable = [
        'user_id',
        'order_number',
        'total_price',
        'status',
        'payment_method',
        'tracking_code',
        'shipping_method',
        'shipping_cost',
        'payment_id',
        'payment_preference_id',
        'payment_checkout_url',
        'checkout_idempotency_key',
        'payment_status',
        'stock_reserved',
        'payment_expires_at',
        'inventory_issue',
        'pix_qr_code',
        'pix_qr_code_base64',
        'boleto_barcode',
        'boleto_url',
        'shipping_address',
    ];

    protected $casts = [
        'total_price' => 'decimal:2',
        'shipping_cost' => 'decimal:2',
        'shipping_address' => 'encrypted:array',
        'pickup_contact_name' => 'encrypted',
        'provider_order_version' => 'integer',
        'stock_reserved' => 'boolean',
        'payment_expires_at' => 'datetime',
        'inventory_issue' => 'boolean',
        'fulfillment_revision' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function fulfillmentEvents(): HasMany
    {
        return $this->hasMany(OrderFulfillmentEvent::class);
    }

    public function fulfillmentStatuses(): array
    {
        return $this->fulfillment_method === 'pickup' ? self::PICKUP_STATUSES : self::DELIVERY_STATUSES;
    }

    public function fulfillmentStatus(): ?string
    {
        if (! in_array($this->status, ['paid', 'shipped'], true)) {
            return null;
        }
        if (in_array($this->fulfillment_status, $this->fulfillmentStatuses(), true)) {
            return $this->fulfillment_status;
        }

        return $this->status === 'shipped' ? 'shipped' : 'confirmed';
    }

    public function canManageFulfillment(): bool
    {
        return in_array($this->status, ['paid', 'shipped'], true)
            && ($this->payment_status === null || $this->payment_status === 'approved')
            && ! $this->inventory_issue;
    }

    public function isDispatched(): bool
    {
        return $this->status === 'shipped' || in_array($this->fulfillment_status, ['shipped', 'delivered', 'collected'], true);
    }
}
