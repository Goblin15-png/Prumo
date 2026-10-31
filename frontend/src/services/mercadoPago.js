let sdkPromise;

export function loadMercadoPago() {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    const timeout = setTimeout(() => fail(), 20000);
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(new Error('Não foi possível carregar o formulário de cartão. Tente novamente.'));
    };
    script.onload = () => {
      clearTimeout(timeout);
      if (window.MercadoPago) resolve(window.MercadoPago);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return sdkPromise;
}
