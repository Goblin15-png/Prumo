// Adaptador integrado: recebe permissões/status do servidor e usa a API autenticada.
export function createOrderFulfillmentService(api) {
  return {
    simulated: false,
    statuses: (order) => order.fulfillment_allowed_statuses || [],
    async update(order, status, trackingCode) {
      const { data } = await api.patch(`/admin/orders/${order.id}/fulfillment`, {
        fulfillment_status: status,
        expected_revision: order.fulfillment_revision,
        tracking_code: trackingCode || null,
      });
      return data.data;
    },
  };
}
