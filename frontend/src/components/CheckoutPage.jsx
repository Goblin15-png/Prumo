import React, { useEffect, useRef, useState } from 'react';
import api, { ensureCsrfCookie } from '../services/api';
import CardPaymentForm from './CardPaymentForm';
import { checkoutStorageKey, readCheckoutAttempt } from '../services/checkoutAttemptStorage';
import { orderCurrency } from './orderPresentation';

const emptyAddress = { recipient_name: '', phone: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' };
const fields = { recipient_name: 'Nome de quem recebe', phone: 'Telefone para entrega', street: 'Rua', number: 'Número', complement: 'Complemento (opcional)', neighborhood: 'Bairro', city: 'Cidade', state: 'Estado (UF)' };
const limits = { recipient_name: 120, phone: 30, street: 150, number: 20, complement: 100, neighborhood: 100, city: 100, state: 2 };
const postalAddressFields = ['street', 'neighborhood', 'city', 'state'];
const inputClass = 'mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink';
const buttonClass = 'rounded-xl bg-[#5E1A2B] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50';
const failure = (error) => Object.values(error.response?.data?.errors || {}).flat()[0] || error.response?.data?.message || 'Não foi possível confirmar a operação. Consulte novamente antes de iniciar outra compra.';

export default function CheckoutPage({ cart, user, onOpenAuth, onRequireVerification, onPaid, onBack, onOrders }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [fulfillment, setFulfillment] = useState('delivery');
  const [pickupName, setPickupName] = useState('');
  const [address, setAddress] = useState(emptyAddress);
  const [postalCode, setPostalCode] = useState('');
  const [addressLookup, setAddressLookup] = useState({ state: 'idle', message: '' });
  const lookupRequest = useRef(0);
  const addressEdits = useRef({});
  const autoFilledAddress = useRef({});
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [method, setMethod] = useState('pix');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentType, setDocumentType] = useState('CPF');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const attempt = useRef(null);
  const submitting = useRef(false);
  const shippingInFlight = useRef(false);
  const paid = useRef(null);
  const paidCallback = useRef(onPaid);
  paidCallback.current = onPaid;
  const storageKey = checkoutStorageKey(user?.id);
  const paymentConfirmed = result?.status === 'paid' || (result?.status === 'shipped' && result?.payment_status === 'approved');
  const pickup = fulfillment === 'pickup';
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const shipping = pickup ? 0 : Number(selectedQuote?.price || 0);
  const ready = pickup ? Boolean(config?.checkout?.pickup_enabled && pickupName.trim()) : Boolean(selectedQuote && Object.entries(address).every(([key, value]) => key === 'complement' || value.trim()));
  const verified = user && (user.email_verified_at || config?.local_test_mode);
  const locked = busy || Boolean(attempt.current || result || recovery);

  const loadConfig = () => {
    setConfigError('');
    api.get('/runtime-config', { timeout: 10000 }).then(({ data }) => setConfig(data)).catch(() => setConfigError('Não foi possível carregar as opções de pagamento.'));
  };
  useEffect(loadConfig, []);
  useEffect(() => {
    setResult(null); setRecovery(null); attempt.current = null; paid.current = null;
    if (!storageKey) return;
    const key = readCheckoutAttempt(user.id);
    if (key) setRecovery(key);
  }, [storageKey]);
  useEffect(() => {
    if (paymentConfirmed && paid.current !== result.order_number) {
      paid.current = result.order_number;
      paidCallback.current?.();
    }
  }, [result, paymentConfirmed]);

  useEffect(() => {
    const request = ++lookupRequest.current;
    const cep = postalCode.replace(/\D/g, '');
    if (pickup || result || recovery || cep.length !== 8) return;
    const controller = new AbortController();
    const edits = { ...addressEdits.current };
    const timer = setTimeout(async () => {
      setAddressLookup({ state: 'loading', message: 'Buscando endereço…' });
      try {
        const { data } = await api.get(`/postal-codes/${cep}`, { signal: controller.signal, timeout: 10000 });
        if (controller.signal.aborted || request !== lookupRequest.current || attempt.current || submitting.current) return;
        if (data.postal_code !== cep || postalAddressFields.some((key) => typeof data[key] !== 'string')) throw new Error('Invalid address');
        const values = Object.fromEntries(postalAddressFields
          .filter((key) => addressEdits.current[key] === edits[key])
          .map((key) => [key, data[key].slice(0, limits[key])]));
        autoFilledAddress.current = values;
        setAddress((current) => ({ ...current, ...values }));
        setAddressLookup({ state: 'success', message: 'Endereço localizado. Confira os campos e complete o número e os dados de entrega.' });
      } catch (err) {
        if (controller.signal.aborted || request !== lookupRequest.current) return;
        setAddressLookup({ state: 'error', message: err.response?.status === 404
          ? 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.'
          : 'Não foi possível buscar o endereço. Você pode preencher os campos manualmente.' });
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [postalCode, pickup, result, recovery]);

  const changePostalCode = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    if (formatted === postalCode) return;
    lookupRequest.current++;
    const previous = autoFilledAddress.current;
    autoFilledAddress.current = {};
    setAddress((current) => Object.fromEntries(Object.entries(current).map(([key, item]) => [key, previous[key] === item ? '' : item])));
    setAddressLookup({ state: 'idle', message: '' });
    setPostalCode(formatted); setSelectedQuote(null); setQuotes([]);
  };

  const refresh = async () => {
    const key = recovery || attempt.current?.idempotency_key;
    if (!key || busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.get(`/checkout/attempt/${key}`);
      setResult(data);
    } catch (err) { setError(failure(err)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (recovery && user) refresh();
  }, [recovery, user?.id]);

  const calculateShipping = async (event) => {
    event.preventDefault();
    if (locked || shippingInFlight.current) return;
    shippingInFlight.current = true;
    setBusy(true); setError(''); setQuotes([]); setSelectedQuote(null);
    try {
      const { data } = await api.post('/shipping/calculate', { postal_code: postalCode, items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })) }, { timeout: 15000 });
      setQuotes(data.data || []);
      if (!data.data?.length) setError('Não há opções de entrega para este CEP e carrinho.');
    } catch (err) {
      setError(Object.values(err.response?.data?.errors || {}).flat()[0] || err.response?.data?.message || 'Não foi possível calcular o frete. Confira sua conexão e tente novamente.');
    } finally { shippingInFlight.current = false; setBusy(false); }
  };
  const submit = async (payment) => {
    if (submitting.current) return;
    if (!verified || !ready || !config?.checkout?.enabled || !cart.length || result || recovery) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      // Retry retains the identical payload and key in memory. Card tokens never enter browser storage.
      if (!attempt.current) {
        attempt.current = {
          idempotency_key: crypto.randomUUID(),
          items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
          fulfillment_method: fulfillment, expected_subtotal: subtotal.toFixed(2), expected_shipping_price: shipping.toFixed(2),
          ...(pickup ? { pickup_contact_name: pickupName.trim() } : { postal_code: postalCode, shipping_option_id: selectedQuote.id, shipping_address: address }),
          payment,
        };
        try { sessionStorage.setItem(storageKey, attempt.current.idempotency_key); } catch { /* In-memory retry remains available. */ }
      }
      await ensureCsrfCookie();
      const { data } = await api.post('/checkout/transparent', attempt.current);
      setResult(data);
    } catch (err) {
      setError(failure(err));
      // Validation/auth failures occur before a payment is submitted and can be corrected safely.
      if ([401, 403, 419, 422].includes(err.response?.status)) {
        attempt.current = null;
        if (err.response.status === 422 && err.response.data?.errors?.shipping_option_id) {
          setSelectedQuote(null);
          setQuotes([]);
        }
        try { sessionStorage.removeItem(storageKey); } catch { /* no storage */ }
      }
    } finally { submitting.current = false; setBusy(false); }
  };
  const reset = () => {
    if (result?.status !== 'cancelled' && !paymentConfirmed) return;
    attempt.current = null; setRecovery(null); setResult(null); setError('');
    try { sessionStorage.removeItem(storageKey); } catch { /* no storage */ }
  };

  return <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8" aria-label="Checkout">
    <button type="button" onClick={onBack} className="text-sm text-brand-ink underline">Voltar para a loja</button>
    <h1 className="font-serif text-3xl font-bold text-brand-ink">Finalizar compra</h1>
    <p className="text-sm text-ink-muted">Escolha como receber e pague aqui na loja.</p>
    {config?.local_test_mode && <p role="status" className="rounded-xl bg-warning-soft p-4 text-sm text-warning-ink">Teste local: catálogo, frete e pagamento simulados. Nenhuma cobrança será feita.</p>}
    {config?.checkout?.environment === 'sandbox' && !config?.local_test_mode && <p role="status" className="rounded-xl bg-warning-soft p-4 text-sm text-warning-ink">Ambiente de testes do Mercado Pago. Use somente os dados de teste do provedor.</p>}
    {config && !config.checkout?.enabled && <p role="alert" className="rounded-xl bg-warning-soft p-4 text-sm text-warning-ink">O pagamento ainda não está disponível neste ambiente.</p>}
    {configError && <div role="alert"><p>{configError}</p><button type="button" onClick={loadConfig} className="underline">Tentar novamente</button></div>}
    {!config && !configError && <p role="status">Carregando checkout…</p>}
    {error && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>}
    {(result || recovery) ? <section className="space-y-4 rounded-2xl border border-line bg-surface p-6" aria-label="Resultado do pagamento">
      <h2 className="text-xl font-semibold">{paymentConfirmed ? 'Pagamento confirmado' : result?.status === 'cancelled' ? 'Pagamento não concluído' : 'Aguardando confirmação do pagamento'}</h2>
      {result?.order_number && <p>Pedido <strong>{result.order_number}</strong> · {orderCurrency(result.total_price)}</p>}
      {result?.test_mode && <p className="text-warning-ink">Resultado de teste local, sem cobrança real.</p>}
      {result?.status === 'pending' && result.pix_qr_code && <div className="space-y-3">
        {result.pix_qr_code_base64 && <img className="h-56 w-56 max-w-full" alt="QR Code para pagamento Pix" src={`data:image/png;base64,${result.pix_qr_code_base64}`} />}
        <label className="block text-sm">Pix copia e cola<textarea readOnly className={inputClass} rows={4} value={result.pix_qr_code} onFocus={(event) => event.target.select()} /></label>
        <p className="text-sm text-ink-muted">Após pagar no aplicativo do seu banco, consulte a confirmação abaixo.</p>
      </div>}
      {(!result || result.status === 'pending') && <><p className="text-sm">Consulte este pedido antes de tentar uma nova compra para evitar pagamentos duplicados.</p><button disabled={busy} className={buttonClass} onClick={refresh}>{busy ? 'Consultando…' : 'Consultar pagamento'}</button></>}
      {result?.status === 'cancelled' && <button className={buttonClass} onClick={reset}>Revisar e tentar novamente</button>}
      {paymentConfirmed && <button className={buttonClass} onClick={() => { reset(); onOrders(); }}>Ver meus pedidos</button>}
    </section> : !cart.length ? <p className="rounded-xl border border-line p-6">Sua sacola está vazia. Adicione um blend para continuar.</p> : <>
      <fieldset disabled={locked} className="space-y-3">
        <legend className="mb-2 font-semibold">Como você quer receber?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex gap-3 rounded-xl border border-line bg-surface p-4"><input type="radio" name="fulfillment" checked={!pickup} onChange={() => setFulfillment('delivery')} /><span>Receber em casa</span></label>
          <label className="flex gap-3 rounded-xl border border-line bg-surface p-4"><input type="radio" name="fulfillment" checked={pickup} disabled={!config?.checkout?.pickup_enabled} onChange={() => setFulfillment('pickup')} /><span>Retirada em loja{!config?.checkout?.pickup_enabled && <small className="block text-ink-soft">Indisponível no momento</small>}</span></label>
        </div>
      </fieldset>
      <div className="grid gap-6 lg:grid-cols-2">
        <fieldset disabled={locked} className="min-w-0 space-y-4 rounded-2xl border border-line bg-surface p-5">
          <legend className="px-2 font-semibold">{pickup ? 'Informações da retirada' : 'Endereço e entrega'}</legend>
          {pickup ? <><p className="whitespace-pre-line text-sm text-ink-muted">{config?.checkout?.pickup_instructions}</p><label className="block text-sm">Nome de quem vai retirar<input required maxLength={120} className={inputClass} value={pickupName} onChange={(event) => setPickupName(event.target.value)} /></label></> : <>
            <form onSubmit={calculateShipping} className="space-y-3">
              <label className="block text-sm">CEP<input required pattern="[0-9]{5}-?[0-9]{3}" maxLength={9} inputMode="numeric" autoComplete="postal-code" aria-describedby="checkout-address-lookup" className={inputClass} value={postalCode} onChange={(event) => changePostalCode(event.target.value)} /></label>
              <p id="checkout-address-lookup" role="status" aria-live="polite" className="text-sm text-ink-muted">{addressLookup.message || 'Digite o CEP para preencher rua, bairro, cidade e estado. Os campos podem ser editados.'}</p>
              {config?.postal_code?.simulated && <p className="text-sm text-warning-ink">Esta prévia usa endereço fictício. Para experimentar o preenchimento, use o CEP 00000-000.</p>}
              {config?.local_test_mode && config?.postal_code?.provider === 'viacep' && !config.postal_code.simulated && <p className="text-sm text-ink-muted">A consulta de CEP usa endereços reais do ViaCEP.</p>}
              <button type="submit" className={buttonClass} disabled={busy}>{busy ? 'Consultando…' : 'Calcular frete'}</button>
            </form>
            {quotes.map((quote) => <label key={quote.id} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm"><input type="radio" name="shipping" checked={selectedQuote?.id === quote.id} onChange={() => setSelectedQuote(quote)} /><span className="flex-1">{quote.name} · {quote.company}<small className="block">Até {quote.delivery_time} dias úteis</small></span><strong>{orderCurrency(quote.price)}</strong></label>)}
            {Object.entries(fields).map(([key, label]) => <label key={key} className="block text-sm">{label}<input required={key !== 'complement'} maxLength={limits[key]} autoComplete={{recipient_name:'name',phone:'tel',street:'address-line1',complement:'address-line2',city:'address-level2',state:'address-level1'}[key] || 'off'} className={inputClass} value={address[key]} onChange={(event) => { addressEdits.current[key] = (addressEdits.current[key] || 0) + 1; setAddress((current) => ({ ...current, [key]: key === 'state' ? event.target.value.replace(/[^a-z]/gi, '').toUpperCase() : event.target.value })); }} /></label>)}
          </>}
        </fieldset>
        <div className="min-w-0 space-y-5">
          <section aria-label="Resumo da compra" className="space-y-3 rounded-2xl border border-line bg-surface-muted p-5 text-sm">
            <h2 className="font-semibold">Resumo da compra</h2>
            {cart.map((item) => <div key={item.id} className="flex justify-between gap-3"><span>{item.quantity}× {item.name}</span><span>{orderCurrency(Number(item.price) * item.quantity)}</span></div>)}
            <div className="flex justify-between"><span>{pickup ? 'Retirada em loja' : 'Frete'}</span><span>{pickup ? 'Sem frete' : selectedQuote ? orderCurrency(shipping) : 'A calcular'}</span></div>
            {pickup && <p>Nome para retirada: {pickupName.trim() || 'Não informado'}</p>}
            <div className="flex justify-between border-t border-line pt-3 font-bold"><span>Total estimado</span><span>{orderCurrency(subtotal + shipping)}</span></div>
          </section>
          <fieldset disabled={locked} className="space-y-3"><legend className="mb-2 font-semibold">Forma de pagamento</legend>{[['pix','Pix'],['credit_card','Cartão de crédito']].map(([value,label]) => <label key={value} className="flex gap-3 rounded-xl border border-line bg-surface p-4"><input type="radio" name="payment" checked={method === value} onChange={() => setMethod(value)} />{label}</label>)}</fieldset>
          {!user ? <button className={buttonClass} onClick={onOpenAuth}>Entre para continuar</button> : !verified ? <button className={buttonClass} onClick={onRequireVerification}>Confirme seu email para comprar</button> : !ready ? <p className="text-sm text-ink-muted">Complete os dados de {pickup ? 'retirada' : 'entrega e escolha o frete'} para pagar.</p> : attempt.current ? <button disabled={busy} className={buttonClass} onClick={() => submit(attempt.current.payment)}>{busy ? 'Confirmando…' : 'Consultar esta tentativa novamente'}</button> : method === 'pix' || config?.local_test_mode ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); submit({ type: method, identification: {type:documentType, number:documentNumber} }); }}>
            <label className="block text-sm">Tipo de documento<select className={inputClass} value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option>CPF</option><option>CNPJ</option></select></label>
            <label className="block text-sm">{documentType}<input required pattern={documentType === 'CPF' ? '[0-9]{11}' : '[0-9]{14}'} maxLength={documentType === 'CPF' ? 11 : 14} inputMode="numeric" className={inputClass} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.replace(/\D/g,''))} /></label>
            <button disabled={busy || !config?.checkout?.enabled} className={`${buttonClass} w-full`} type="submit">{busy ? 'Confirmando…' : config?.local_test_mode ? 'Finalizar pedido (teste)' : 'Gerar Pix'}</button>
          </form> : config?.checkout?.public_key && config.checkout.enabled ? <CardPaymentForm publicKey={config.checkout.public_key} amount={subtotal + shipping} email={user.email} onSubmit={submit} /> : <p role="alert" className="text-sm text-danger-ink">Pagamento com cartão indisponível no momento.</p>}
        </div>
      </div>
    </>}
  </section>;
}
