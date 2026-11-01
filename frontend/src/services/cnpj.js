export function normalizeCnpj(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[.\-/]/g, '');
}

export function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const digit = (base) => {
    let sum = 0;
    let weight = base.length - 7;
    for (const character of base) {
      sum += (character.charCodeAt(0) - 48) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  };
  const base = cnpj.slice(0, 12);
  const first = digit(base);
  return cnpj === base + first + digit(base + first);
}
