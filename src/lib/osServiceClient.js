'use strict';

/**
 * Cliente HTTP do os-service.
 * A Lambda NÃO acessa o banco do os-service: consulta o endpoint interno
 * GET /internal/clients/by-cpf/:cpf, protegido pelo header x-internal-api-key.
 */

class OsServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'OsServiceError';
    this.cause = cause;
  }
}

function createOsServiceClient({ baseUrl, apiKey, timeoutMs = 3000, fetchImpl = globalThis.fetch }) {
  if (!baseUrl) throw new Error('OS_SERVICE_URL não configurada');
  if (!apiKey) throw new Error('INTERNAL_API_KEY não configurada');

  const root = baseUrl.replace(/\/+$/, '');

  return {
    /**
     * @returns {Promise<null | {id, name, email, cpfCnpj, status, active}>} null quando não encontrado
     */
    async findClientByCpf(cpf) {
      let res;
      try {
        res = await fetchImpl(`${root}/internal/clients/by-cpf/${encodeURIComponent(cpf)}`, {
          method: 'GET',
          headers: { 'x-internal-api-key': apiKey, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new OsServiceError('os-service indisponível', err);
      }

      if (res.status === 404) return null;
      if (!res.ok) throw new OsServiceError(`os-service respondeu ${res.status}`);

      const body = await res.json();
      return body.data;
    },
  };
}

module.exports = { createOsServiceClient, OsServiceError };
