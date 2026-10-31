<?php

namespace App\Services;

use App\Models\Order;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class OrderFulfillmentService
{
    public function update(int $id, User $administrator, array $data, bool $legacyShipment = false): Order
    {
        try {
            return DB::transaction(function () use ($id, $administrator, $data, $legacyShipment): Order {
                $order = Order::whereKey($id)->lockForUpdate()->firstOrFail();
                if (! $order->canManageFulfillment()) {
                    throw ValidationException::withMessages(['order' => ['Só é possível alterar um pedido pago e sem pendências de estoque.']]);
                }
                if (! in_array($order->fulfillment_method, ['delivery', 'pickup'], true) || ($legacyShipment && $order->fulfillment_method !== 'delivery')) {
                    throw ValidationException::withMessages(['order' => ['Operação incompatível com a modalidade do pedido.']]);
                }
                $revision = (int) $order->fulfillment_revision;
                if (array_key_exists('expected_revision', $data) && (int) $data['expected_revision'] !== $revision) {
                    throw new HttpResponseException(response()->json(['message' => 'O pedido foi alterado por outra operação. Atualize a lista e selecione o status novamente.'], 409));
                }
                $previous = $order->fulfillmentStatus();
                $previousTracking = $order->tracking_code;
                $status = $legacyShipment ? ($previous === 'delivered' ? 'delivered' : 'shipped') : $data['fulfillment_status'];
                if (! in_array($status, $order->fulfillmentStatuses(), true)) {
                    throw ValidationException::withMessages(['fulfillment_status' => ['Status incompatível com a modalidade do pedido.']]);
                }
                $tracking = array_key_exists('tracking_code', $data) ? trim((string) $data['tracking_code']) : $order->tracking_code;
                if ($order->fulfillment_method === 'pickup' || ! in_array($status, ['shipped', 'delivered'], true)) {
                    $tracking = null;
                }
                $tracking = $tracking === '' ? null : $tracking;
                $changed = $previous !== $status || $previousTracking !== $tracking;
                if ($changed) {
                    $order->forceFill(['fulfillment_status' => $status, 'tracking_code' => $tracking, 'fulfillment_revision' => $revision + 1])->save();
                    $order->fulfillmentEvents()->create([
                        'admin_user_id' => $administrator->id,
                        'from_status' => $previous,
                        'to_status' => $status,
                        'from_tracking_code' => $previousTracking,
                        'to_tracking_code' => $tracking,
                        'revision' => $revision + 1,
                    ]);
                }
                if ($legacyShipment) {
                    // Mantém o contrato legado sem rebaixar um pedido já entregue.
                    $order->forceFill(['status' => 'shipped', 'stock_reserved' => false])->save();
                }

                return $order;
            });
        } catch (QueryException $exception) {
            Log::critical('Falha ao persistir status e histórico do pedido.', ['order_id' => $id, 'exception' => get_class($exception)]);
            throw new HttpResponseException(response()->json(['message' => 'Não foi possível registrar o status e seu histórico. Tente novamente mais tarde.'], 503));
        }
    }
}
