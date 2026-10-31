// Compatível com as tentativas existentes: somente UUID, separado por cliente e aba.
export const checkoutStorageKey = (userId) => userId == null ? null : `protocolo-checkout:${userId}`;

export function readCheckoutAttempt(userId) {
  const key = checkoutStorageKey(userId);
  if (!key) return null;
  try {
    const value = sessionStorage.getItem(key);
    return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}
