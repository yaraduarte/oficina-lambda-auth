'use strict';

/**
 * Configuração compartilhada de JWT entre a Lambda de autenticação (emissora)
 * e a Lambda authorizer do API Gateway (validadora).
 */
module.exports = {
  /** Emissor dos tokens de clientes (POST /auth, por CPF). */
  ISSUER: 'oficina-marimb0ndo-auth',
  /** Emissor dos tokens de funcionários (POST /os/api/auth/login no os-service). */
  STAFF_ISSUER: 'oficina-marimb0ndo-os',
  /** Público-alvo: as APIs atrás do API Gateway. */
  AUDIENCE: 'oficina-marimb0ndo-api',
  ALGORITHM: 'HS256',
  ACTIVE_STATUS: 'ATIVO',
};
