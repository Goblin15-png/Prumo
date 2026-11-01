<?php

namespace App\Auth;

use App\Models\User;

final class AdminPermissions
{
    public const OWNER = [
        'support.view', 'support.reply', 'support.manage',
        'products.view', 'products.create', 'products.update', 'products.stock', 'products.delete',
        'categories.view', 'categories.create', 'categories.update', 'categories.delete', 'categories.assign', 'categories.order',
        'taxonomy.view', 'taxonomy.manage', 'health.view', 'insights.generate', 'orders.view', 'orders.ship', 'orders.fulfillment.update',
    ];

    public static function forUser(User $user): array
    {
        if (! $user->isAdmin()) {
            return [];
        }

        // Nenhuma permissão comercial é concedida implicitamente ao técnico ou a contas legadas.
        return match ($user->admin_profile) {
            'owner' => self::OWNER,
            'technical' => ['system.view'],
            default => [],
        };
    }
}
