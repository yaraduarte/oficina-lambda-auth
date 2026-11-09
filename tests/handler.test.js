'use strict';

const jwt = require('jsonwebtoken');
const { createHandler, ISSUER, AUDIENCE } = require('../src/handler');
const { OsServiceError } = require('../src/lib/osServiceClient');

const SECRET = 'test-secret';
const VALID_CPF = '111.444.777-35';

const activeClient = {
  id: 'c-1',
  name: 'João Silva',
  email: 'joao@email.com',
  cpfCnpj: '11144477735',
  status: 'ATIVO',
  active: true,
};

const silentLogger = { error: jest.fn(), warn: jest.fn() };

function makeHandler(findClientByCpf) {
  return createHandler({
    osServiceClient: { findClientByCpf: jest.fn(findClientByCpf) },
    jwtSecret: SECRET,
    logger: silentLogger,
  });
}

const event = (body) => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });
const parse = (res) => JSON.parse(res.body);

describe('handler de autenticação', () => {
  it('emite JWT para cliente ATIVO com issuer, audience e claims esperadas', async () => {
    const handler = makeHandler(async () => activeClient);

    const res = await handler(event({ cpf: VALID_CPF }));

    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body.client).toEqual({ id: 'c-1', name: 'João Silva', email: 'joao@email.com' });
    expect(body.expiresIn).toBe('24h');

    const claims = jwt.verify(body.token, SECRET, { issuer: ISSUER, audience: AUDIENCE });
    expect(claims).toMatchObject({ sub: 'c-1', cpf: '11144477735', role: 'CLIENT', status: 'ATIVO' });
  });

  it('consulta o os-service apenas com os dígitos do CPF', async () => {
    const find = jest.fn(async () => activeClient);
    const handler = createHandler({ osServiceClient: { findClientByCpf: find }, jwtSecret: SECRET, logger: silentLogger });

    await handler(event({ cpf: VALID_CPF }));

    expect(find).toHaveBeenCalledWith('11144477735');
  });

  it.each(['INATIVO', 'BLOQUEADO'])('nega token (403) para cliente com status %s', async (status) => {
    const handler = makeHandler(async () => ({ ...activeClient, status, active: false }));

    const res = await handler(event({ cpf: VALID_CPF }));

    expect(res.statusCode).toBe(403);
    expect(parse(res)).toEqual({ message: 'Cliente inativo: autenticação não permitida', status });
    expect(parse(res).token).toBeUndefined();
  });

  it('nega token quando active=false mesmo com status ATIVO (ex.: cliente removido)', async () => {
    const handler = makeHandler(async () => ({ ...activeClient, active: false }));
    const res = await handler(event({ cpf: VALID_CPF }));
    expect(res.statusCode).toBe(403);
  });

  it('retorna 404 quando cliente não existe', async () => {
    const handler = makeHandler(async () => null);
    const res = await handler(event({ cpf: VALID_CPF }));
    expect(res.statusCode).toBe(404);
  });

  it('retorna 503 quando o os-service está indisponível', async () => {
    const handler = makeHandler(async () => {
      throw new OsServiceError('timeout');
    });
    const res = await handler(event({ cpf: VALID_CPF }));
    expect(res.statusCode).toBe(503);
  });

  it('retorna 500 em erro inesperado', async () => {
    const handler = makeHandler(async () => {
      throw new Error('boom');
    });
    const res = await handler(event({ cpf: VALID_CPF }));
    expect(res.statusCode).toBe(500);
  });

  it('retorna 400 para JSON inválido', async () => {
    const res = await makeHandler(async () => activeClient)(event('{nao-json'));
    expect(res.statusCode).toBe(400);
  });

  it.each([{}, { cpf: '' }])('retorna 400 quando CPF ausente (%p)', async (body) => {
    const res = await makeHandler(async () => activeClient)(event(body));
    expect(res.statusCode).toBe(400);
  });

  it('retorna 400 quando o evento não tem body', async () => {
    const res = await makeHandler(async () => activeClient)({});
    expect(res.statusCode).toBe(400);
  });

  it.each(['111.111.111-11', '123', '111.444.777-36'])('retorna 422 para CPF inválido %s', async (cpf) => {
    const find = jest.fn();
    const handler = createHandler({ osServiceClient: { findClientByCpf: find }, jwtSecret: SECRET, logger: silentLogger });
    const res = await handler(event({ cpf }));
    expect(res.statusCode).toBe(422);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('exports.handler (configuração por variáveis de ambiente)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  it('retorna 500 quando a configuração está incompleta', async () => {
    delete process.env.OS_SERVICE_URL;
    process.env.JWT_SECRET = SECRET;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { handler } = require('../src/handler');

    const res = await handler(event({ cpf: VALID_CPF }));

    expect(res.statusCode).toBe(500);
    errorSpy.mockRestore();
  });

  it('usa o os-service configurado e reaproveita o handler entre invocações', async () => {
    process.env.OS_SERVICE_URL = 'http://os-service';
    process.env.INTERNAL_API_KEY = 'k';
    process.env.JWT_SECRET = SECRET;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: activeClient }) });
    const { handler } = require('../src/handler');

    expect((await handler(event({ cpf: VALID_CPF }))).statusCode).toBe(200);
    expect((await handler(event({ cpf: VALID_CPF }))).statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });
});
