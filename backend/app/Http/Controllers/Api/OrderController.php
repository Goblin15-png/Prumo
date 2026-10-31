<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderFulfillmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(private OrderFulfillmentService $fulfillment) {}

    public function index(Request $request): JsonResponse
    {
        $orders = Order::query()
            ->with('items')
            ->whereIn('status', ['paid', 'shipped'])
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json(['data' => $orders->map(fn (Order $order) => $this->customerView($order))]);
    }

    public function show(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::query()
            ->with('items')
            ->whereIn('status', ['paid', 'shipped'])
            ->where('user_id', $request->user()->id)
            ->where('order_number', $orderNumber)
            ->firstOrFail();

        return response()->json(['data' => $this->customerView($order)]);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::in(['pending', 'paid', 'shipped', 'cancelled'])],
            'fulfillment_stage' => ['nullable', 'string', Rule::in(array_unique([...Order::DELIVERY_STATUSES, ...Order::PICKUP_STATUSES]))],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);
        $query = Order::query()->with($this->adminRelations())->whereIn('status', ['paid', 'shipped']);
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        if ($stage = $data['fulfillment_stage'] ?? null) {
            $query->where(function ($matching) use ($stage) {
                $matching->where('fulfillment_status', $stage);
                if (in_array($stage, ['confirmed', 'shipped'], true)) {
                    $matching->orWhere(fn ($legacy) => $legacy->whereNull('fulfillment_status')->where('status', $stage === 'confirmed' ? 'paid' : 'shipped'));
                }
            });
        }
        if ($search = trim($data['search'] ?? '')) {
            $query->where(function ($matching) use ($search) {
                $matching->where('order_number', 'like', '%'.$search.'%')
                    ->orWhereHas('user', fn ($users) => $users->where(fn ($names) => $names->where('name', 'like', '%'.$search.'%')->orWhere('email', 'like', '%'.$search.'%')));
            });
        }
        $orders = $query->orderByDesc('created_at')->orderByDesc('id')->paginate(25);

        return response()->json(['data' => $orders->getCollection()->map(fn (Order $order) => $this->adminView($order)), 'meta' => ['current_page' => $orders->currentPage(), 'last_page' => $orders->lastPage(), 'total' => $orders->total()]]);
    }

    private function adminRelations(): array
    {
        return ['user:id,name,email', 'items', 'fulfillmentEvents' => fn ($events) => $events->with('administrator:id,name')->latest('id')->limit(50)];
    }

    private function adminView(Order $order): array
    {
        return [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'status' => $order->status,
            'payment_status' => $order->payment_status,
            'payment_method' => $order->payment_method,
            'inventory_issue' => $order->inventory_issue,
            ...$this->fulfillmentView($order),
            'fulfillment_allowed_statuses' => $order->canManageFulfillment() ? $order->fulfillmentStatuses() : [],
            'fulfillment_history' => $order->fulfillmentEvents->reverse()->values()->map(fn ($event) => [
                'from' => $event->from_status, 'to' => $event->to_status,
                'actor' => $event->administrator?->name ?? 'Administrador indisponível',
                'at' => $event->created_at,
                'revision' => $event->revision,
                'previous_tracking_code' => $event->from_tracking_code,
                'tracking_code' => $event->to_tracking_code,
            ]),
            'total_price' => $order->total_price,
            'shipping_method' => $order->shipping_method,
            'shipping_cost' => $order->shipping_cost,
            'tracking_code' => $order->tracking_code,
            'shipping_address' => $order->shipping_address,
            'created_at' => $order->created_at,
            'user' => $order->user,
            'items' => $order->items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'unit_price' => $item->unit_price,
                'quantity' => $item->quantity,
                'subtotal' => $item->subtotal,
            ]),
        ];
    }

    public function updateFulfillment(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'fulfillment_status' => ['required', 'string', Rule::in(array_unique([...Order::DELIVERY_STATUSES, ...Order::PICKUP_STATUSES]))],
            'expected_revision' => ['required', 'integer', 'min:0', 'max:4294967294'],
            'tracking_code' => ['nullable', 'string', 'max:100'],
            'status' => ['prohibited'], 'payment_status' => ['prohibited'],
            'fulfillment_method' => ['prohibited'], 'fulfillment_revision' => ['prohibited'],
            'stock_reserved' => ['prohibited'], 'inventory_issue' => ['prohibited'],
            'total_price' => ['prohibited'], 'user_id' => ['prohibited'], 'admin_user_id' => ['prohibited'],
        ]);
        $order = $this->fulfillment->update($id, $request->user(), $data);

        return response()->json(['message' => 'Status do pedido salvo.', 'data' => $this->adminView($order->fresh()->load($this->adminRelations()))]);
    }

    public function markShipped(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'tracking_code' => ['required', 'string', 'max:100'],
            'expected_revision' => ['sometimes', 'integer', 'min:0', 'max:4294967294'],
        ]);

        $order = $this->fulfillment->update($id, $request->user(), $data, legacyShipment: true);

        return response()->json(['message' => 'Rastreio salvo.', 'order' => $order->fresh()->load(['user:id,name,email', 'items'])]);
    }

    private function customerView(Order $order): array
    {
        return [
            'order_number' => $order->order_number,
            'status' => $order->status,
            ...$this->fulfillmentView($order),
            'payment_status' => $order->payment_status,
            'payment_method' => $order->payment_method,
            'total_price' => $order->total_price,
            'shipping_method' => $order->shipping_method,
            'shipping_cost' => $order->shipping_cost,
            'tracking_code' => $order->tracking_code,
            'payment_expires_at' => $order->payment_expires_at,
            'checkout_url' => $order->status === 'pending' && $order->payment_expires_at?->isFuture()
                ? $order->payment_checkout_url
                : null,
            'created_at' => $order->created_at,
            'items' => $order->items->map(fn ($item) => [
                'product_name' => $item->product_name,
                'unit_price' => $item->unit_price,
                'quantity' => $item->quantity,
                'subtotal' => $item->subtotal,
            ]),
            'shipping_address' => $order->shipping_address,
        ];
    }

    private function fulfillmentView(Order $order): array
    {
        return [
            'pickup_contact_name' => $order->pickup_contact_name,
            'fulfillment_method' => $order->fulfillment_method,
            'fulfillment_status' => $order->fulfillmentStatus(),
            'fulfillment_revision' => $order->fulfillment_revision,
        ];
    }
}
