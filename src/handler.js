const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  ssl:      { rejectUnauthorized: false },
  max:      1,
  idleTimeoutMillis: 5000,
});

function validateCpf(cpf) {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  if (check !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  return check === parseInt(digits[10]);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { message: 'JSON inválido no corpo da requisição' });
  }

  const { cpf } = body;

  if (!cpf) {
    return response(400, { message: 'CPF é obrigatório' });
  }

  if (!validateCpf(cpf)) {
    return response(422, { message: 'CPF inválido' });
  }

  const cpfDigits = cpf.replace(/\D/g, '');

  let client;
  try {
    client = await pool.connect();

    const result = await client.query(
      'SELECT id, name, email, cpf_cnpj FROM clients WHERE cpf_cnpj = $1 AND deleted_at IS NULL LIMIT 1',
      [cpfDigits]
    );

    if (result.rows.length === 0) {
      return response(404, { message: 'Cliente não encontrado ou inativo' });
    }

    const clientData = result.rows[0];

    const token = jwt.sign(
      {
        sub:   clientData.id,
        name:  clientData.name,
        email: clientData.email,
        cpf:   cpfDigits,
        type:  'client',
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return response(200, {
      token,
      expiresIn: '24h',
      client: {
        id:    clientData.id,
        name:  clientData.name,
        email: clientData.email,
      },
    });
  } catch (err) {
    console.error('Erro ao consultar banco:', err);
    return response(500, { message: 'Erro interno ao processar autenticação' });
  } finally {
    if (client) client.release();
  }
};
