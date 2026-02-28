# GPT Registry

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Discover and catalog Custom GPTs across your organization. Connects to the OpenAI Compliance API to fetch GPTs, applies configurable filters, classifies them into categories using an LLM, and presents results in a dashboard.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Frontend      │────▶│   Backend       │────▶│  PostgreSQL  │
│   React + Vite  │     │   FastAPI       │     │  + pgvector  │
│   Port 3000     │     │   Port 8000     │     │  Port 5433   │
└─────────────────┘     └─────────────────┘     └──────────────┘
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
           OpenAI         OpenAI       OpenAI
          Compliance     GPT API     Embeddings
            API         (classify)    (vectors)
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, TanStack Query, Vite
- **Backend**: FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic
- **Database**: PostgreSQL 16 with pgvector extension
- **Deployment**: Docker Compose (3 services)

## Quick Start

### Prerequisites

- Docker Desktop

### Setup

```bash
# 1. Clone and configure
cp .env.example .env

# 2. Generate a Fernet encryption key and add it to .env
make fernet-key

# 3. Start all services
make up

# 4. Open the app
open http://localhost:3000
```

Run `make help` to see all available commands.

## Setup Wizard

The app guides you through a 4-step wizard:

1. **API Configuration** — Enter your OpenAI Compliance API key and workspace ID. Optionally enable LLM classification with an OpenAI API key.
2. **Filter Rules** — Configure visibility filters (invite-only, workspace-with-link, etc.), minimum shared users, and excluded email addresses.
3. **Categories** — Define categories for GPT classification. Seed with defaults or create custom ones.
4. **Fetch & Classify** — Run the pipeline. Watch real-time progress and logs, then view results.

## Demo Mode

Built-in demo mode replaces all external API calls with mock services for fully offline demos and testing.

- Toggle **Demo** in the header bar (turns amber when active)
- Choose a preset size: Small (50), Medium (500), Large (2K), Enterprise (5K)
- Generates realistic GPTs across 10 SaaS departments (Marketing, Sales, CS, Finance, HR, Engineering, Product, Legal, Data, IT/Security)
- Simulated delays for realistic progress bar and log behavior
- No API keys required

### How it works

Mock services share the same interface as real services. The pipeline selects which implementation to use:

| Stage     | Real Mode                | Demo Mode                |
|-----------|--------------------------|--------------------------|
| Fetch     | OpenAI Compliance API    | Template-based generator |
| Classify  | OpenAI GPT model         | Keyword matching         |
| Embed     | OpenAI Embeddings API    | Deterministic vectors    |

Everything else (filtering, database storage, categories, logs) runs the same code path.

## Project Structure

```
├── backend/
│   ├── alembic/                  # Database migrations
│   ├── app/
│   │   ├── config.py             # Environment settings
│   │   ├── database.py           # Async SQLAlchemy engine
│   │   ├── encryption.py         # Fernet encrypt/decrypt for API keys
│   │   ├── main.py               # FastAPI app entry point
│   │   ├── models/models.py      # SQLAlchemy models (Configuration, Category, GPT, SyncLog)
│   │   ├── routers/
│   │   │   ├── admin.py          # POST /admin/reset
│   │   │   ├── categories.py     # CRUD /categories
│   │   │   ├── configuration.py  # GET/PUT /config, POST /config/test-connection
│   │   │   ├── demo.py           # GET/PUT /demo
│   │   │   └── pipeline.py       # POST /pipeline/run, GET /pipeline/status|summary|gpts|history
│   │   ├── schemas/schemas.py    # Pydantic request/response models
│   │   └── services/
│   │       ├── classifier.py     # OpenAI LLM classifier
│   │       ├── compliance_api.py # OpenAI Compliance API client
│   │       ├── demo_state.py     # In-memory demo toggle
│   │       ├── embedder.py       # OpenAI embeddings
│   │       ├── filter_engine.py  # Visibility/email/shared-user filters
│   │       ├── mock_classifier.py
│   │       ├── mock_data.py      # ~90 GPT templates across 10 departments
│   │       ├── mock_embedder.py
│   │       ├── mock_fetcher.py
│   │       └── pipeline.py       # Orchestrates fetch → filter → classify → embed → store
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts         # API client (fetch wrapper)
│   │   ├── App.tsx               # Root component with wizard/results navigation
│   │   ├── components/
│   │   │   ├── layout/           # Header, Stepper, NavButtons, Card
│   │   │   ├── steps/            # Step1-4 wizard screens
│   │   │   ├── ui/ResultsView.tsx
│   │   │   └── ResultsDashboard.tsx
│   │   ├── hooks/                # React Query hooks (useConfiguration, useCategories, usePipeline, useDemo)
│   │   └── types/index.ts        # TypeScript interfaces
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── scripts/
│   ├── db_queries.sql            # Useful SQL queries
│   └── reset_registry.py        # CLI tool to clear GPT data
├── docs/
│   └── erd.mmd                   # Entity-relationship diagram (Mermaid)
├── docker-compose.yml
└── .env.example
```

## API Endpoints

| Method | Endpoint                     | Description                        |
|--------|------------------------------|------------------------------------|
| GET    | `/api/v1/health`             | Health check                       |
| GET    | `/api/v1/config`             | Get configuration                  |
| PUT    | `/api/v1/config`             | Update configuration               |
| POST   | `/api/v1/config/test-connection` | Test Compliance API connection |
| GET    | `/api/v1/categories`         | List categories                    |
| POST   | `/api/v1/categories`         | Create category                    |
| PUT    | `/api/v1/categories/:id`     | Update category                    |
| DELETE | `/api/v1/categories/:id`     | Delete category                    |
| POST   | `/api/v1/categories/seed`    | Seed default categories            |
| POST   | `/api/v1/pipeline/run`       | Start pipeline                     |
| GET    | `/api/v1/pipeline/status`    | Pipeline progress                  |
| GET    | `/api/v1/pipeline/summary`   | Results summary                    |
| GET    | `/api/v1/pipeline/gpts`      | List discovered GPTs               |
| GET    | `/api/v1/pipeline/history`   | Sync history                       |
| GET    | `/api/v1/pipeline/logs/:id`  | Pipeline logs for a sync run       |
| GET    | `/api/v1/demo`               | Get demo mode state                |
| PUT    | `/api/v1/demo`               | Toggle demo mode                   |
| POST   | `/api/v1/admin/reset`        | Reset registry (clear GPTs)        |

## Environment Variables

| Variable               | Description                          | Default                            |
|------------------------|--------------------------------------|------------------------------------|
| `POSTGRES_USER`        | Database user                        | `gpt_registry`                     |
| `POSTGRES_PASSWORD`    | Database password                    | `changeme`                         |
| `POSTGRES_DB`          | Database name                        | `gpt_registry`                     |
| `DATABASE_URL`         | Full async connection string         | (composed from above)              |
| `FERNET_KEY`           | Encryption key for API keys at rest  | (required, generate with script)   |
| `BACKEND_CORS_ORIGINS` | Allowed CORS origins                 | `http://localhost:3000`            |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
