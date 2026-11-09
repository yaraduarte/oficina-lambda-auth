'use strict';

const jwt = require('jsonwebtoken');
const { onlyDigits, isValidCpf } = require('./lib/cpf');
const { createOsServiceClient, OsServiceError } = require('./lib/osServiceClient');

const TOKEN_TTL = '24h';
const ISSUER = 'oficina-marimb0ndo-auth';
const AUDIENCE = 'oficina-marimb0ndo-api';
const ACTIVE_STATUS = 'ATIVO';

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Fábrica do handler (permite injetar dependências nos testes).
 * Fluxo: valida CPF → consulta o os-service → nega se status != ATIVO → assina o JWT.
 */
function createHandler({ osServiceClient, jwtSecret, logger = console }) {
  return async (event) => {
    let body;
    try {
      body = JSON.parse(event?.body || '{}');
    } catch {
      return response(400, { message: 'JSON inválido no corpo da requisição' });
    }

    const { cpf } = body;
    if (!cpf) return response(400, { message: 'CPF é obrigatório' });
    if (!isValidCpf(cpf)) return response(422, { message: 'CPF inválido' });

    const cpfDigits = onlyDigits(cpf);

    let client;
    try {
      client = await osServiceClient.findClientByCpf(cpfDigits);
    } catch (err) {
      logger.error('Falha ao consultar os-service:', err.message);
      const status = err instanceof OsServiceError ? 503 : 500;
      return response(status, { message: 'Serviço de clientes indisponível, tente novamente' });
    }

    if (!client) return response(404, { message: 'Cliente não encontrado' });

    // Regra explícita: só clientes com status ATIVO recebem token
    if (client.status !== ACTIVE_STATUS || client.active === false) {
      logger.warn(`Token negado: cliente ${client.id} com status ${client.status}`);
      return response(403, {
        message: 'Cliente inativo: autenticação não permitida',
        status: client.status,
      });
    }

    const token = jwt.sign(
      {
        sub: client.id,
        name: client.name,
        email: client.email,
        cpf: cpfDigits,
        type: 'client',
        role: 'CLIENT',
        status: client.status,
      },
      jwtSecret,
      { expiresIn: TOKEN_TTL, issuer: ISSUER, audience: AUDIENCE },
    );

    return response(200, {
      token,
      expiresIn: TOKEN_TTL,
      client: { id: client.id, name: client.name, email: client.email },
    });
  };
}

let cachedHandler;

exports.handler = async (event) => {
  if (!cachedHandler) {
    try {
      if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurada');
      cachedHandler = createHandler({
        osServiceClient: createOsServiceClient({
          baseUrl: process.env.OS_SERVICE_URL,
          apiKey: process.env.INTERNAL_API_KEY,
          timeoutMs: Number(process.env.OS_SERVICE_TIMEOUT_MS || 3000),
        }),
        jwtSecret: process.env.JWT_SECRET,
      });
    } catch (err) {
      console.error('Configuração inválida da Lambda:', err.message);
      return response(500, { message: 'Erro interno ao processar autenticação' });
    }
  }
  return cachedHandler(event);
};

exports.createHandler = createHandler;
exports.ISSUER = ISSUER;
exports.AUDIENCE = AUDIENCE;
