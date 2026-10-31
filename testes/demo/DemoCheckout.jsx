import React, { useEffect, useState } from 'react';
import { cartTotal, currency, demoAddress, demoCustomer, demoShipping } from './demoModel';

export default function DemoCheckout({ cart, scenario }) {
  const [fulfillment, setFulfillment] = useState('delivery');
  const [shippingId, setShippingId] = useState(demoShipping[0].id);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [address, setAddress] = useState({ ...demoAddress });
  const [pickupName, setPickupName] = useState(demoCustomer.name);
  const [nameError, setNameError] = useState('');
  const [result, setResult] = useState('');
  const selectedShipping = demoShipping.find((option) => option.id === shippingId) || demoShipping[0];
  const pickup = fulfillment === 'pickup';
  const shippingPrice = pickup ? 0 : selectedShipping.price;
  const subtotal = cartTotal(cart);
  const paymentLabel = paymentMethod === 'pix' ? 'Pix' : 'Cartão de crédito';
  const fieldClass = 'mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm';

  useEffect(() => { setResult(''); setNameError(''); }, [fulfillment, shippingId, paymentMethod, pickupName, cart, scenario]);

  const simulatePayment = () => {
    if (pickup && !pickupName.trim()) {
      setResult('');
      setNameError('Informe o nome de quem vai retirar.');
      return;
    }
    setNameError('');
    setResult(scenario === 'pagamento-recusado' ? 'recusado' : 'aprovado');
  };

  if (!cart.length) return <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted p-8 text-center text-sm text-ink-muted">Para visualizar o checkout, adicione um produto à sacola. Não é necessário cadastrar nenhum endereço real.</p>;

  return <div className="space-y-6">
    <fieldset className="space-y-3">
      <legend className="mb-2 font-semibold">Como você quer receber?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 text-sm ${!pickup ? 'border-brand-ink bg-surface-muted' : 'border-line'}`}>
          <input type="radio" name="demo-fulfillment" value="delivery" checked={!pickup} onChange={() => setFulfillment('delivery')} />
          <span><strong className="block">Receber em casa</strong><span className="text-xs text-ink-soft">Entrega no endereço informado · frete simulado</span></span>
        </label>
        <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 text-sm ${pickup ? 'border-brand-ink bg-surface-muted' : 'border-line'}`}>
          <input type="radio" name="demo-fulfillment" value="pickup" checked={pickup} onChange={() => setFulfillment('pickup')} />
          <span><strong className="block">Retirada em loja</strong><span className="text-xs text-ink-soft">Sem frete · pagamento pelo checkout</span></span>
        </label>
      </div>
    </fieldset>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        {pickup ? <section aria-label="Informações da retirada" className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
          <h3 className="font-semibold">Retirada em loja</h3>
          <p className="text-sm text-ink-muted">Você não precisa informar endereço de entrega para esta opção.</p>
          <label className="block text-xs font-semibold text-ink-muted" htmlFor="demo-pickup-name">Nome de quem vai retirar
            <input id="demo-pickup-name" className={fieldClass} required maxLength={120} autoComplete="off" value={pickupName} onChange={(event) => setPickupName(event.target.value)} aria-invalid={Boolean(nameError)} aria-describedby={`demo-pickup-name-help${nameError ? ' demo-pickup-name-error' : ''}`} />
          </label>
          <p id="demo-pickup-name-help" className="text-xs text-ink-soft">Informe o nome para identificar a retirada. Nesta prévia, use um nome fictício.</p>
          {nameError && <p id="demo-pickup-name-error" role="alert" className="text-xs font-semibold text-danger-ink">{nameError}</p>}
          <p className="text-xs text-ink-soft">Prévia: o endereço e os horários da loja ainda precisam ser definidos. Não há retirada agendada nesta demonstração.</p>
        </section> : <>
          <section aria-label="Endereço de entrega" className="space-y-3">
            <h3 className="font-semibold">Endereço fictício editável</h3>
            <p className="text-xs text-ink-soft">Use os dados de exemplo. Estes campos não são enviados a servidores.</p>
            {['recipient_name', 'street', 'number', 'neighborhood', 'city', 'state', 'postal_code'].map((key) => <label key={key} className="block text-xs font-semibold text-ink-muted">
              {({ recipient_name: 'Destinatário', street: 'Rua', number: 'Número', neighborhood: 'Bairro', city: 'Cidade', state: 'Estado', postal_code: 'CEP' })[key]}
              <input className={fieldClass} value={address[key]} onChange={(event) => { setResult(''); setAddress((current) => ({ ...current, [key]: event.target.value })); }} />
            </label>)}
          </section>
          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold">Frete fictício</legend>
            {demoShipping.map((option) => <label key={option.id} className="flex cursor-pointer justify-between gap-2 rounded-xl border border-line p-4 text-sm">
              <span><input type="radio" name="demo-shipping" checked={shippingId === option.id} onChange={() => setShippingId(option.id)} className="mr-2" />{option.name}<small className="block pl-5 text-ink-soft">Até {option.delivery_time} dias úteis · simulação</small></span><strong>{currency(option.price)}</strong>
            </label>)}
          </fieldset>
        </>}
      </div>
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Forma de pagamento</legend>
          <p className="text-xs text-ink-soft">Pagamento pelo checkout, tanto para entrega quanto para retirada.</p>
          {[
            ['pix', 'Pix', 'Prévia do pagamento via Pix. Nenhum QR Code ou cobrança real será gerado.'],
            ['credit_card', 'Cartão de crédito', 'Prévia do pagamento com cartão. Nenhum dado de cartão é solicitado nesta demonstração.'],
          ].map(([value, label, description]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${paymentMethod === value ? 'border-brand-ink bg-surface-muted' : 'border-line'}`}>
            <input type="radio" name="demo-payment" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} />
            <span><strong className="block">{label}</strong><small className="mt-1 block text-ink-soft">{description}</small></span>
          </label>)}
        </fieldset>
        <section aria-label="Resumo da compra" className="space-y-2 rounded-xl bg-surface-muted p-4 text-sm">
          <h3 className="mb-3 font-semibold">Resumo da compra · simulação</h3>
          <div className="flex justify-between gap-3"><span>Produtos</span><span>{currency(subtotal)}</span></div>
          <div className="flex justify-between gap-3"><span>{pickup ? 'Retirada em loja' : 'Frete'}</span><span>{pickup ? 'Sem frete' : currency(shippingPrice)}</span></div>
          {pickup && <div className="flex justify-between gap-3"><span>Nome para retirada</span><span className="min-w-0 break-words text-right">{pickupName.trim() || 'Não informado'}</span></div>}
          <div className="flex justify-between gap-3"><span>Pagamento</span><span>{paymentLabel}</span></div>
          <div className="flex justify-between gap-3 border-t pt-3 font-bold"><span>Total fictício</span><span>{currency(subtotal + shippingPrice)}</span></div>
        </section>
        <button type="button" className="w-full rounded-xl bg-[#5E1A2B] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4A1422]" onClick={simulatePayment}>Simular resultado do pagamento</button>
        {result && <p role="status" className={`break-words rounded-xl p-3 text-sm ${result === 'aprovado' ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink'}`}>Pagamento <strong>{result}</strong> na simulação com {paymentLabel}. {pickup ? `Retirada em loja por ${pickupName.trim()}` : 'Entrega no endereço fictício'}. Nenhuma transação foi realizada.</p>}
        <p className="text-xs text-ink-soft">Esta demonstração não cria pedidos, reservas de retirada ou pagamentos reais. A integração final com o provedor continua pendente.</p>
      </div>
    </div>
  </div>;
}
