'use strict';

const jwt = require('jsonwebtoken');
const { createAuthorizer, extractBearer, handler } = require('../src/authorizer');
const { ISSUER, STAFF_ISSUER, AUDIENCE } = require('../src/lib/jwtConfig');

const SECRET = 'test-secret';
const logger = { error: jest.fn(), warn: jest.fn() };
const authorize = createAuthorizer({ jwtSecret: SECRET, logger });

const sign = (claims, opts = {}) =>
  jwt.sign(claims, opts.secret ?? SECRET, {
    issuer: opts.issuer ?? ISSUER,
    audience: opts.audience ?? AUDIENCE,
    expiresIn: opts.expiresIn ?? '1h',
    algorithm: opts.algorithm ?? 'HS256',
  });

const clientToken = (overrides = {}, opts) =>
  sign({ sub: 'c-1', type: 'client', role: 'CLIENT', status: 'ATIVO', ...overrides }, opts);

const event = (authorization) => ({ headers: authorization === undefined ? {} : { authorization } });

describe('authorizer do API Gateway', () => {
  it('autoriza token de cliente ATIVO e repassa o contexto', async () => {
    const res = await authorize(event(`Bearer ${clientToken()}`));
    expect(res).toEqual({
      isAuthorized: true,
      context: { sub: 'c-1', role: 'CLIENT', type: 'client', status: 'ATIVO' },
    });
  });

  it('autoriza token de funcionário emitido pelo os-service', async () => {
    const token = sign({ sub: 'u-1', role: 'ADMIN' }, { issuer: STAFF_ISSUER });
    const res = await authorize(event(`Bearer ${token}`));
    expect(res.isAuthorized).toBe(true);
    expect(res.context).toMatchObject({ sub: 'u-1', role: 'ADMIN', type: 'staff' });
  });

  it.each(['INATIVO', 'BLOQUEADO', undefined])('nega token de cliente com status %p', async (status) => {
    const res = await authorize(event(`Bearer ${clientToken({ status })}`));
    expect(res).toEqual({ isAuthorized: false });
  });

  it('nega sem header Authorization', async () => {
    expect(await authorize(event(undefined))).toEqual({ isAuthorized: false });
  });

  it.each(['Basic abc', 'Bearer', 'token-sem-prefixo'])('nega header malformado %p', async (h) => {
    expect((await authorize(event(h))).isAuthorized).toBe(false);
  });

  it('nega assinatura com outro segredo', async () => {
    const res = await authorize(event(`Bearer ${clientToken({}, { secret: 'outro' })}`));
    expect(res.isAuthorized).toBe(false);
  });

  it('nega issuer desconhecido', async () => {
    const res = await authorize(event(`Bearer ${clientToken({}, { issuer: 'atacante' })}`));
    expect(res.isAuthorized).toBe(false);
  });

  it('nega audience errada', async () => {
    const res = await authorize(event(`Bearer ${clientToken({}, { audience: 'outra-api' })}`));
    expect(res.isAuthorized).toBe(false);
  });

  it('nega token expirado', async () => {
    const res = await authorize(event(`Bearer ${clientToken({}, { expiresIn: -10 })}`));
    expect(res.isAuthorized).toBe(false);
  });

  it('nega algoritmo diferente de HS256', async () => {
    const res = await authorize(event(`Bearer ${clientToken({}, { algorithm: 'HS512' })}`));
    expect(res.isAuthorized).toBe(false);
  });

  it('nega tudo quando JWT_SECRET não está configurada', async () => {
    const noSecret = createAuthorizer({ jwtSecret: undefined, logger });
    expect(await noSecret(event(`Bearer ${clientToken()}`))).toEqual({ isAuthorized: false });
  });

  it('exports.handler usa JWT_SECRET do ambiente', async () => {
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = SECRET;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await handler(event(`Bearer ${clientToken()}`))).isAuthorized).toBe(true);
    expect((await handler(event('Bearer invalido'))).isAuthorized).toBe(false);
    warn.mockRestore();
    process.env.JWT_SECRET = saved;
  });
});

describe('extractBearer', () => {
  it('lê header em maiúsculas e identitySource', () => {
    expect(extractBearer({ headers: { Authorization: 'Bearer abc' } })).toBe('abc');
    expect(extractBearer({ identitySource: ['bearer xyz'] })).toBe('xyz');
    expect(extractBearer(undefined)).toBeNull();
  });
});
