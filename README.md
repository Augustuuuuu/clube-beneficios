# clube beneficios

Site de clube de benefícios com backend em Django e banco de dados PostgreSQL.

## Backend Django + banco de dados

- **Backend**: Django 5 (Python) em `manage.py` / pasta `clube` e app `beneficios`.
- **Banco em dev**: SQLite local por padrão (arquivo `db.sqlite3`).
- **Banco em produção**: PostgreSQL gerenciado (Render free tier por padrão, definido em `render.yaml`).

### Rodar localmente

1. Crie e ative um ambiente virtual Python (opcional, mas recomendado).
2. Instale dependências:
   ```bash
   pip install -r requirements.txt
   ```
3. Exporte variáveis de ambiente mínimas (em desenvolvimento você pode manter `DEBUG=True`):
   - `SECRET_KEY` – qualquer string longa e aleatória.
   - `DEBUG` – `True` em desenvolvimento.
4. Aplique migrações e crie um superusuário:
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   ```
5. Inicie o servidor:
   ```bash
   python manage.py runserver
   ```
6. Acesse:
   - Admin Django: `http://127.0.0.1:8000/admin/`
   - Healthcheck: `http://127.0.0.1:8000/api/health/`

### Modelagem de dados (resumo)

- **EmpresaParceira (`Partner`)**: dados das empresas que oferecem benefícios.
- **CampaignConfig**: configuração global (validade dos códigos, termos, missão bônus).
- **Offer**: benefícios/ofertas configuráveis por janela de tempo, com tag e CTA.
- **Member**: usuários finais (nome + WhatsApp em formato E.164).
- **Subscription**: assinaturas/plano por usuário (ativa, cancelada, expirada).
- **Redemption**: resgates de códigos (liga `Member` a `Offer`, com código + validade).
- **AdminAccessLog**: log simples de acessos ao painel admin/gerente.

## Deploy na Render (free tier)

O arquivo `render.yaml` define:

- Um serviço **web Python** (`clube-beneficios-web`) rodando:
  - Build: `pip install -r requirements.txt`
  - Start: `gunicorn clube.wsgi:application`
  - Variáveis: `SECRET_KEY` gerada automaticamente, `DEBUG=False`, `ALLOWED_HOSTS=*`, `DATABASE_URL` apontando para o PostgreSQL.
- Um **PostgreSQL** gerenciado (`clube-beneficios-db`) no plano gratuito.

Fluxo recomendado:

1. Suba o código para o GitHub.
2. No painel da Render, importe o repositório usando o `render.yaml` como blueprint (ou crie manualmente um Web Service Python + Database Postgres).
3. Aguarde o build e o deploy.
4. Rode as migrações no serviço web (Shell da Render):
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   ```
5. Acesse o domínio fornecido pela Render:
   - `/admin/` para painel administrativo.
   - `/api/health/` para checar se a API está de pé.

## Backups e limites

- **Backups**:
  - Use o painel da Render (aba do banco PostgreSQL) para gerar dumps (`pg_dump`) periódicos.
  - Em ambientes próprios, use algo como:
    ```bash
    pg_dump "$DATABASE_URL" > backup_clube_beneficios.sql
    ```
- **Limites da camada gratuita** (Render):
  - CPU/memória e tempo de inatividade (free tier pode hibernar).
  - Espaço de disco limitado para o banco.
  - Recomendado migrar para plano pago se o uso crescer.

Para produção mais séria, considere plano pago na Render ou outro provedor (DigitalOcean, Railway pago, etc.) para garantir maior disponibilidade.

## Entrega para o cliente

- **Acesso ao painel**:
  - URL base: domínio fornecido pela Render (ex.: `https://clube-beneficios.onrender.com`).
  - Painel admin Django: `https://SEU_DOMINIO/admin/` (usar usuário criado com `createsuperuser`).
- **O que o cliente consegue fazer**:
  - Cadastrar/editar empresas parceiras (`Partner`).
  - Criar e gerenciar ofertas (`Offer`) com janelas de horário.
  - Ver a lista de resgates (`Redemption`) e exportar via admin.
  - Gerenciar usuários (`Member`) e assinaturas (`Subscription`), se necessário.
- **Responsabilidades do cliente**:
  - Guardar as credenciais do superusuário em local seguro.
  - Acompanhar limites do plano gratuito na Render e decidir quando migrar para um plano pago.
  - Fazer backup periódico do banco (ou contratar você para fazer isso).


