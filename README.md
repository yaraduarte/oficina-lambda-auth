# oficina-lambda-auth

Função **AWS Lambda** de autenticação da **Oficina Marimbondo**. Recebe um CPF, valida os dígitos, consulta o cliente no **os-service** e devolve um JWT, **somente para clientes com status `ATIVO`**.

## Tecnologias

- Node.js 22
- AWS Lambda (SAM)
- JWT (`jsonwebtoken`)
- Jest (testes unitários, cobertura mínima de 80% exigida no CI)
- GitHub Actions (CI/CD)

## Arquitetura

```
Cliente
   │  POST /auth { cpf }
   ▼
API Gateway
   │
   ▼
Lambda (oficina-auth)
   ├── 1. Valida o CPF pelos dígitos verificadores
   ├── 2. GET {OS_SERVICE_URL}/internal/clients/by-cpf/{cpf}
   │        header x-internal-api-key   (não acessa o banco de outro serviço)
   ├── 3. status != ATIVO  →  403 (token negado)
   └── 4. Assina o JWT (iss, aud, sub, role=CLIENT, status)
```

**Por que não consultar o banco direto?** Na arquitetura de microsserviços da Fase 4, a tabela `clients` pertence ao os-service, e nenhum serviço pode acessar o banco de outro. A regra de autenticação usa o campo explícito `status` (`ATIVO` / `INATIVO` / `BLOQUEADO`), e não mais apenas `deleted_at`.

## Endpoint

```
POST /auth
Content-Type: application/json

{ "cpf": "111.444.777-35" }
```

### Resposta 200
```json
{
  "token": "eyJhbGci...",
  "expiresIn": "24h",
  "client": { "id": "uuid", "name": "João", "email": "joao@email.com" }
}
```

Claims do token: `sub`, `name`, `email`, `cpf`, `type=client`, `role=CLIENT`, `status`, `iss=oficina-marimb0ndo-auth`, `aud=oficina-marimb0ndo-api`.

### Erros
| Código | Motivo |
|--------|--------|
| 400 | CPF ausente ou JSON inválido |
| 422 | CPF com dígitos inválidos |
| 403 | Cliente com status `INATIVO` ou `BLOQUEADO` (token negado) |
| 404 | Cliente não encontrado |
| 503 | os-service indisponível |
| 500 | Erro interno / configuração ausente |

## Lambda authorizer do API Gateway

O mesmo repositório publica a função `oficina-authorizer` (`src/authorizer.js`), usada como **Lambda authorizer (REQUEST, respostas simples)** do API Gateway HTTP API declarado no `oficina-infra-k8s`.

| Verificação | Regra |
|---|---|
| Header | `Authorization: Bearer <jwt>` |
| Assinatura | HS256 com `JWT_SECRET` |
| `iss` | `oficina-marimb0ndo-auth` (clientes) ou `oficina-marimb0ndo-os` (funcionários) |
| `aud` | `oficina-marimb0ndo-api` |
| `exp` | não expirado |
| Cliente | `status` precisa ser `ATIVO` |

Quando autoriza, devolve `{ isAuthorized: true, context: { sub, role, type, status } }`, e o Gateway repassa esse contexto ao serviço de destino. Em qualquer falha devolve `{ isAuthorized: false }` e o Gateway responde **403** sem chegar ao k3s.

## Configuração

| Variável | Origem no deploy | Descrição |
|----------|------------------|-----------|
| `OS_SERVICE_URL` | variável `OS_SERVICE_URL` do environment (`homolog` / `production`) | URL base do os-service |
| `INTERNAL_API_KEY` | secret `INTERNAL_API_KEY` | Chave do header `x-internal-api-key` |
| `JWT_SECRET` | secret `JWT_SECRET` | Chave de assinatura do JWT |

## Testes

```bash
npm install --prefix src
npm ci
npm test        # Jest com cobertura (mínimo 80%)
```

## Como executar localmente

```bash
npm install --prefix src
sam build
sam local invoke AuthFunction --event events/test.json
```

### Evento de teste (`events/test.json`)
```json
{ "body": "{\"cpf\": \"111.444.777-35\"}" }
```

## CI/CD

Pipeline em `.github/workflows/deploy.yml`: todo PR roda `node --check`, `sam validate --lint` e `sam build`.

### Fluxo de branches e ambientes

```
feature/*  ──PR──►  homolog  ──PR──►  main
                      │                 │
                      ▼                 ▼
   stack oficina-lambda-auth-hml  stack oficina-lambda-auth
```

- `main` e `homolog` são **protegidas**: push direto bloqueado (inclusive para admin), merge só via Pull Request com os checks obrigatórios verdes e conversas resolvidas.
- Todo PR roda o pipeline de validação; o deploy acontece apenas após o merge.

O template recebe o parâmetro `Environment` (`prod`/`hml`): em homologação a função se chama `oficina-auth-hml` e usa o database `oficina_db_hml`.

### Secrets necessários

| Secret | Descrição |
|--------|-----------|
| `AWS_ACCESS_KEY_ID` | Access key da AWS |
| `AWS_SECRET_ACCESS_KEY` | Secret key da AWS |
| `INTERNAL_API_KEY` | Chave para o endpoint interno do os-service |
| `JWT_SECRET` | Chave secreta para assinar o JWT |
