import React, { useEffect, useId, useRef, useState } from 'react';
import { loadMercadoPago } from '../services/mercadoPago';

export default function CardPaymentForm({ publicKey, amount, email, onSubmit }) {
  const id = `card-payment-${useId().replace(/:/g, '')}`;
  const submit = useRef(onSubmit);
  submit.current = onSubmit;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let controller;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const MercadoPago = await loadMercadoPago();
        if (disposed) return;
        controller = await new MercadoPago(publicKey, { locale: 'pt-BR' }).bricks().create('cardPayment', id, {
          initialization: { amount, payer: { email } },
          customization: { paymentMethods: { types: { excluded: ['debit_card', 'prepaid_card'] }, maxInstallments: 12 } },
          callbacks: {
            onReady: () => { if (!disposed) setLoading(false); },
            onError: () => { if (!disposed) { setLoading(false); setError('Confira os dados do cartão ou tente carregar o formulário novamente.'); } },
            onSubmit: (formData, additionalData) => {
              if (disposed) return Promise.reject(new Error('Formulário encerrado.'));
              if (additionalData?.paymentTypeId !== 'credit_card') return Promise.reject(new Error('Selecione um cartão de crédito.'));
              return submit.current({ type: 'credit_card', id: formData.payment_method_id, token: formData.token, installments: formData.installments, identification: formData.payer.identification });
            },
          },
        });
        if (disposed) await controller.unmount();
      } catch {
        if (!disposed) { setLoading(false); setError('Não foi possível carregar o formulário de cartão. Tente novamente.'); }
      }
    })();
    return () => { disposed = true; if (controller) Promise.resolve(controller.unmount()).catch(() => {}); };
  }, [publicKey, amount, email, id, retry]);
  return <div>
    {loading && <p role="status" className="text-sm text-ink-muted">Carregando formulário seguro…</p>}
    <div id={id} />
    {error && <div role="alert" className="text-sm text-danger-ink"><p>{error}</p><button type="button" className="mt-2 underline" onClick={() => setRetry((value) => value + 1)}>Carregar novamente</button></div>}
  </div>;
}
