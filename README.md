# oficina-lambda-auth

Função **AWS Lambda** de autenticação da **Oficina Marimbondo**. Recebe um CPF, valida o formato, consulta o cliente no banco de dados e devolve um JWT válido para consumo das APIs protegidas.

## Tecnologias

- Node.js 22
- AWS Lambda + API Gateway (SAM)
- PostgreSQL (AWS RDS via `pg`)
- JWT (`jsonwebtoken`)
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
   ├── Valida formato do CPF
   ├── Consulta RDS PostgreSQL
   │     SELECT * FROM clients WHERE cpf_cnpj = $1
   └── Retorna JWT { token, expiresIn, client }
```

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

### Erros
| Código | Motivo |
|--------|--------|
| 400 | CPF ausente ou JSON inválido |
| 422 | CPF com formato inválido |
| 404 | Cliente não encontrado |
| 500 | Erro interno |

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

Push na `main` dispara build + deploy automático via GitHub Actions.

### Secrets necessários

| Secret | Descrição |
|--------|-----------|
| `AWS_ACCESS_KEY_ID` | Access key da AWS |
| `AWS_SECRET_ACCESS_KEY` | Secret key da AWS |
| `DB_HOST` | Endpoint do RDS |
| `DB_PASSWORD` | Senha do banco |
| `JWT_SECRET` | Chave secreta para assinar o JWT |
