'use strict';

/** Remove tudo que não for dígito. */
function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Valida CPF pelos dígitos verificadores. */
function isValidCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  const checkDigit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

module.exports = { onlyDigits, isValidCpf };
