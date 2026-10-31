(function () {
  // O HTML é compartilhado pela loja, pelo painel e pela recuperação de senha.
  if (/^\/(admin|reset-password)(\/|$)/i.test(window.location.pathname)) return;
  if (window.protocoloTagManager) return;

  var loaded = false;
  var granted = false;
  window.dataLayer = window.dataLayer || [];

  function gtag() { window.dataLayer.push(arguments); }
  function consentState(accepted) {
    var value = accepted ? 'granted' : 'denied';
    return {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value,
    };
  }

  // Define o padrão antes de carregar qualquer tag do contêiner.
  gtag('consent', 'default', consentState(false));

  function setConsent(accepted) {
    accepted = accepted === true;
    if (accepted !== granted) {
      granted = accepted;
      gtag('consent', 'update', consentState(accepted));
      window.dataLayer.push({
        event: 'protocolo_consent_update',
        tracking_consent: accepted ? 'granted' : 'denied',
      });
    }
    if (!accepted || loaded) return;
    loaded = true;

    // Trecho do contêiner informado, executado uma única vez após o aceite.
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','GTM-5HTKMSRK');
  }

  window.protocoloTagManager = { setConsent: setConsent };
  try {
    var saved = document.cookie.split(';').map(function (entry) { return entry.trim(); });
    setConsent(saved.indexOf('meta-pixel-consent=accepted') !== -1 &&
      saved.indexOf('google-tag-manager-consent=accepted') !== -1);
  } catch { /* A interface pedirá a escolha se o navegador bloquear o cookie. */ }
})();
