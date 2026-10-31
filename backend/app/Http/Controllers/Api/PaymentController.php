<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\CheckoutService;
use App\Services\MercadoPagoOrdersService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    public function __construct(protected CheckoutService $checkoutService) {}

    public function checkout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'idempotency_key' => ['required', 'uuid'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.product_id' => ['required', 'integer', 'distinct', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'postal_code' => ['required', 'string', 'regex:/^\d{5}-?\d{3}$/'],
            'shipping_option_id' => ['required', 'integer', 'min:1'],
            'expected_subtotal' => ['required', 'numeric', 'min:0.01', 'max:999999.99'],
            'expected_shipping_price' => ['required', 'numeric', 'min:0.01', 'max:9999.99'],
            'shipping_address' => ['required', 'array'],
            'shipping_address.recipient_name' => ['required', 'string', 'max:120'],
            'shipping_address.phone' => ['required', 'string', 'max:30'],
            'shipping_address.street' => ['required', 'string', 'max:150'],
            'shipping_address.number' => ['required', 'string', 'max:20'],
            'shipping_address.complement' => ['nullable', 'string', 'max:100'],
            'shipping_address.neighborhood' => ['required', 'string', 'max:100'],
            'shipping_address.city' => ['required', 'string', 'max:100'],
            'shipping_address.state' => ['required', 'string', 'regex:/^[A-Za-z]{2}$/'],
        ]);

        $data['postal_code'] = preg_replace('/\D/', '', $data['postal_code']);
        $data['shipping_address'] = array_merge($data['shipping_address'], [
            'postal_code' => $data['postal_code'],
            'state' => strtoupper($data['shipping_address']['state']),
        ]);

        $result = $this->checkoutService->create($request->user(), $data);

        return response()->json([
            'message' => ($result['test_mode'] ?? false)
                ? 'Pedido de teste concluído. Nenhuma cobrança foi feita.'
                : 'Pedido criado. Continue o pagamento no Mercado Pago.',
            'order_number' => $result['order_number'],
            'checkout_url' => $result['checkout_url'],
        ], $result['reused'] ? 200 : 201);
    }

    public function transparent(Request $request): JsonResponse
    {
        $delivery = $request->input('fulfillment_method') === 'delivery';
        $realCard = $request->input('payment.type') === 'credit_card' && ! (app()->environment('local') && config('services.local_test_mode'));
        $data = $request->validate([
            'idempotency_key' => ['required', 'uuid'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.product_id' => ['required', 'integer', 'distinct', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'fulfillment_method' => ['required', Rule::in(['delivery', 'pickup'])],
            'pickup_contact_name' => ['exclude_unless:fulfillment_method,pickup', 'required', 'string', 'max:120', 'regex:/\S/u'],
            'postal_code' => ['exclude_unless:fulfillment_method,delivery', 'required', 'string', 'regex:/^\d{5}-?\d{3}$/'],
            'shipping_option_id' => ['exclude_unless:fulfillment_method,delivery', 'required', 'integer', 'min:1'],
            'expected_subtotal' => ['required', 'numeric', 'min:0.01', 'max:999999.99'],
            'expected_shipping_price' => ['required', 'numeric', 'min:0', 'max:9999.99'],
            'shipping_address' => ['exclude_unless:fulfillment_method,delivery', 'required', 'array:recipient_name,phone,street,number,complement,neighborhood,city,state'],
            'shipping_address.recipient_name' => [Rule::requiredIf($delivery), 'string', 'max:120'],
            'shipping_address.phone' => [Rule::requiredIf($delivery), 'string', 'max:30'],
            'shipping_address.street' => [Rule::requiredIf($delivery), 'string', 'max:150'],
            'shipping_address.number' => [Rule::requiredIf($delivery), 'string', 'max:20'],
            'shipping_address.complement' => ['nullable', 'string', 'max:100'],
            'shipping_address.neighborhood' => [Rule::requiredIf($delivery), 'string', 'max:100'],
            'shipping_address.city' => [Rule::requiredIf($delivery), 'string', 'max:100'],
            'shipping_address.state' => [Rule::requiredIf($delivery), 'string', 'regex:/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/'],
            'payment' => ['required', 'array:type,id,token,installments,identification'],
            'payment.type' => ['required', Rule::in(['pix', 'credit_card'])],
            'payment.id' => ['exclude_unless:payment.type,credit_card', Rule::requiredIf($realCard), 'string', 'regex:/^[a-zA-Z0-9_]{1,50}$/'],
            'payment.token' => ['exclude_unless:payment.type,credit_card', Rule::requiredIf($realCard), 'string', 'regex:/^[a-zA-Z0-9_-]{10,200}$/'],
            'payment.installments' => ['exclude_unless:payment.type,credit_card', Rule::requiredIf($realCard), 'integer', 'min:1', 'max:12'],
            'payment.identification' => ['required', 'array:type,number'],
            'payment.identification.type' => ['required', Rule::in(['CPF', 'CNPJ'])],
            'payment.identification.number' => ['required', 'string', 'regex:/^(\d{11}|\d{14})$/'],
            'card_number' => ['prohibited'], 'security_code' => ['prohibited'],
        ]);
        if ($delivery) {
            $data['postal_code'] = preg_replace('/\D/', '', $data['postal_code']);
            $data['shipping_address']['postal_code'] = $data['postal_code'];
        }
        $result = $this->checkoutService->create($request->user(), $data, transparent: true);

        return response()->json($result, 200)->header('Cache-Control', 'no-store, private');
    }

    public function transparentStatus(Request $request, string $number, MercadoPagoOrdersService $payments): JsonResponse
    {
        $order = Order::query()->where('user_id', $request->user()->id)->where(fn ($query) => $query->where('order_number', $number)->orWhere('checkout_idempotency_key', $number))->whereNotNull('checkout_request_hash')->firstOrFail();

        return response()->json($payments->view($payments->refresh($order)))->header('Cache-Control', 'no-store, private');
    }
}
