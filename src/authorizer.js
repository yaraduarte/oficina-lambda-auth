'use strict';

/**
 * Lambda authorizer (REQUEST, payload 2.0, respostas simples) do API Gateway HTTP API.
 *
 * Valida o header Authorization: Bearer <jwt>:
 *   - assinatura HS256 com JWT_SECRET
 *   - issuer: tokens de cliente (Lambda auth) ou de funcionário (os-service)
 *   - audience: oficina-marimb0ndo-api
 *   - expiração
 *   - tokens de cliente precisam ter status ATIVO
 *
 * Em caso de sucesso, repassa sub/role/type/status no contexto
 * (disponível para as integrações como $context.authorizer.*).
 */

const jwt = require('jsonwebtoken');
const { ISSUER, STAFF_ISSUER, AUDIENCE, ALGORITHM, ACTIVE_STATUS } = require('./lib/jwtConfig');

const DENY = Object.freeze({ isAuthorized: false });

function extractBearer(event) {
  const headers = event?.headers ?? {};
  const raw = headers.authorization ?? headers.Authorization ?? event?.identitySource?.[0] ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return match ? match[1] : null;
}

function createAuthorizer({ jwtSecret, logger = console }) {
  return async (event) => {
    if (!jwtSecret) {
      logger.error('JWT_SECRET não configurada no authorizer');
      return DENY;
    }

    const token = extractBearer(event);
    if (!token) return DENY;

    let claims;
    try {
      claims = jwt.verify(token, jwtSecret, {
        algorithms: [ALGORITHM],
        audience: AUDIENCE,
        issuer: [ISSUER, STAFF_ISSUER],
      });
    } catch (err) {
      logger.warn(`Token rejeitado: ${err.message}`);
      return DENY;
    }

    const type = claims.type === 'client' ? 'client' : 'staff';
    if (type === 'client' && claims.status !== ACTIVE_STATUS) {
      logger.warn(`Token de cliente ${claims.sub} rejeitado: status ${claims.status}`);
      return DENY;
    }

    return {
      isAuthorized: true,
      context: {
        sub: String(claims.sub),
        role: String(claims.role ?? ''),
        type,
        status: String(claims.status ?? ''),
      },
    };
  };
}

exports.handler = (event) => createAuthorizer({ jwtSecret: process.env.JWT_SECRET })(event);
exports.createAuthorizer = createAuthorizer;
exports.extractBearer = extractBearer;
