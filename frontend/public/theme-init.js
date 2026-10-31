// Executa antes da pintura, como arquivo externo compatível com a CSP.
(() => {
  let preference;
  try { preference = document.cookie.split('; ').find((entry) => entry.startsWith('protocolo-theme='))?.slice('protocolo-theme='.length); } catch { /* preferência apenas nesta visita */ }
  const theme = preference === 'light' || preference === 'dark'
    ? preference
    : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
