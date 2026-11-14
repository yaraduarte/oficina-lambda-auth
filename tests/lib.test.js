'use strict';

const { isValidCpf, onlyDigits } = require('../src/lib/cpf');
const { createOsServiceClient, OsServiceError } = require('../src/lib/osServiceClient');

describe('cpf', () => {
  it.each(['111.444.777-35', '11144477735', '529.982.247-25'])('aceita CPF válido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['', null, undefined, '123', '000.000.000-00', '111.444.777-34', '111.444.777-25', '1114447773500'])(
    'rejeita CPF inválido %p',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it('onlyDigits remove formatação', () => {
    expect(onlyDigits('111.444.777-35')).toBe('11144477735');
    expect(onlyDigits(undefined)).toBe('');
  });
});

describe('osServiceClient', () => {
  const okResponse = (data) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) });

  it('exige baseUrl e apiKey', () => {
    expect(() => createOsServiceClient({ apiKey: 'k' })).toThrow('OS_SERVICE_URL');
    expect(() => createOsServiceClient({ baseUrl: 'http://x' })).toThrow('INTERNAL_API_KEY');
  });

  it('chama o endpoint interno com a chave e devolve data', async () => {
    const fetchImpl = jest.fn(async () => okResponse({ id: 'c-1', status: 'ATIVO' }));
    const client = createOsServiceClient({ baseUrl: 'http://os-service/', apiKey: 'segredo', fetchImpl });

    const result = await client.findClientByCpf('11144477735');

    expect(result).toEqual({ id: 'c-1', status: 'ATIVO' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://os-service/internal/clients/by-cpf/11144477735');
    expect(options.headers['x-internal-api-key']).toBe('segredo');
    expect(options.signal).toBeDefined();
  });

  it('devolve null em 404', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 404 }));
    const client = createOsServiceClient({ baseUrl: 'http://x', apiKey: 'k', fetchImpl });
    await expect(client.findClientByCpf('1')).resolves.toBeNull();
  });

  it('lança OsServiceError em resposta de erro', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401 }));
    const client = createOsServiceClient({ baseUrl: 'http://x', apiKey: 'k', fetchImpl });
    await expect(client.findClientByCpf('1')).rejects.toBeInstanceOf(OsServiceError);
  });

  it('lança OsServiceError em falha de rede/timeout', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = createOsServiceClient({ baseUrl: 'http://x', apiKey: 'k', fetchImpl });
    await expect(client.findClientByCpf('1')).rejects.toThrow('os-service indisponível');
  });
});
