# AgentsOrg

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Enterprise AI governance platform for organizations running Custom GPTs on OpenAI. Connects to the OpenAI Compliance API to discover, classify, and semantically enrich every GPT in your workspace — then surfaces actionable intelligence through a leader dashboard, an employee portal, and a learning & development module.

## Views

### Leader Dashboard
The primary governance interface. Sidebar navigation across:

- **Overview** — KPI strip, creation velocity, portfolio health at a glance. Five drill-down sub-pages (Builders, Processes, Departments, Maturity, Output Types) with full search, sort, and GPT-level slide-out detail.
- **Enrichment** — Pipeline status, data source roadmap (GPTs → Conversations → Users → Audit Logs) with per-source unlock breakdown.
- **Risk Panel** — GPTs flagged as high or critical risk, with per-flag breakdown.
- **Duplicates** — pgvector-powered semantic clustering to detect redundant builds.
- **Quality Scores** — Prompting quality distribution across the portfolio.
- **Recognition** — Composite builder scores (quality 35 % · adoption 25 % · hygiene 25 % · volume 15 %).
- **Learning** — LLM-driven course recommendations per builder, based on actual KPI gaps. Draws from a built-in OpenAI Academy catalog; custom courses can be added via URL.
- **Workshops** — CRUD for in-person/virtual sessions with participant lists, GPT tagging, and time-based quality impact correlation.

### Employee Portal
Read-only GPT discovery for non-admin users. Search and browse GPTs available to them without accessing governance data.

### Setup Wizard
4-step guided setup: API credentials → filter rules → categories → run pipeline.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Frontend      │────▶│   Backend       │────▶│  PostgreSQL  │
│   React + Vite  │     │   FastAPI       │     │  + pgvector  │
│   Port 3000     │     │   Port 8000     │     │  Port 5433   │
└─────────────────┘     └─────────────────┘     └──────────────┘
                              │
                  ┌───────────┼─────────────┐
                  ▼           ▼             ▼
           OpenAI         OpenAI        OpenAI
          Compliance     GPT API      Embeddings
            API         (classify +    (vectors +
                         enrich)       clustering)
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, TanStack Query, Vite
- **Backend**: FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic
- **Database**: PostgreSQL 16 with pgvector extension
- **Deployment**: Docker Compose (3 services)

---

## Quick Start

### Prerequisites

- Docker Desktop

### Setup

```bash
# 1. Clone and enter the repo
git clone https://github.com/ori129/agentsorg.git
cd agentsorg

# 2. Create your .env file
cp .env.example .env

# 3. Generate a Fernet key and paste it into FERNET_KEY= in .env
make fernet-key

# 4. Start all services (migrations run automatically on first boot)
make up

# 5. Open the app
open http://localhost:3000
```

Run `make help` to see all available commands.

> **No API keys needed** — enable Demo mode in the header to run the full pipeline with realistic mock data.

---

## Pipeline

The pipeline runs in stages and reports live progress to the frontend:

```
Fetch (5–30%) → Filter (35%) → Classify (40–65%) → Enrich (65–72%) → Embed (75–85%) → Store (90%) → Done (100%)
```

| Stage    | Real Mode                     | Demo Mode                    |
|----------|-------------------------------|------------------------------|
| Fetch    | OpenAI Compliance API         | Template-based generator     |
| Classify | OpenAI GPT model              | Keyword matching             |
| Enrich   | 9× LLM calls per GPT          | Deterministic mock enricher  |
| Embed    | OpenAI Embeddings API         | Deterministic vectors        |

Everything else (filtering, DB storage, categories, clustering, L&D) runs the same code path in both modes.

### Semantic Enrichment — 9 KPIs per GPT

Each enriched GPT receives scores and rationale for:

| KPI | What it captures |
|-----|-----------------|
| `business_process` | Which workflow this GPT automates |
| `risk_level` + `risk_flags` | Data exposure, compliance concerns |
| `sophistication_score` | Depth of system prompt and tooling (1–5) |
| `prompting_quality_score` | Prompt engineering quality (1–5) |
| `roi_potential_score` | Estimated business impact (1–5) |
| `intended_audience` | Who the GPT is built for |
| `integration_flags` | External systems connected |
| `output_type` | Document, Analysis, Code, Conversation, etc. |
| `adoption_friction_score` | How easy it is for others to use (1–5) |

### Portfolio Maturity Tiers

| Tier | Sophistication score | Description |
|------|----------------------|-------------|
| Production | ≥ 4 | Full system prompts, integrations, tested |
| Functional | 3 | Useful, room to grow |
| Experimental | ≤ 2 | Early-stage or abandoned |

Demo mode distributes ~60 % Experimental / ~25 % Functional / ~15 % Production.

---

## Demo Mode

- Toggle **Demo** in the header (turns amber when active)
- Choose a preset size: Small (50), Medium (500), Large (2K), Enterprise (5K)
- Generates realistic GPTs across 10 SaaS departments (Marketing, Sales, CS, Finance, HR, Engineering, Product, Legal, Data, IT/Security)
- Full semantic enrichment with mock scores and rationale
- No API keys required

---

## Project Structure

```
├── backend/
│   ├── alembic/
│   │   └── versions/                     # 001–006 migrations (auto-applied on startup)
│   ├── app/
│   │   ├── config.py                     # Environment settings
│   │   ├── database.py                   # Async SQLAlchemy engine
│   │   ├── encryption.py                 # Fernet encrypt/decrypt for API keys
│   │   ├── main.py                       # FastAPI app entry point
│   │   ├── models/models.py              # ORM models
│   │   ├── schemas/schemas.py            # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── admin.py                  # POST /admin/reset
│   │   │   ├── categories.py             # CRUD /categories
│   │   │   ├── clustering.py             # Duplicate detection via pgvector
│   │   │   ├── configuration.py          # GET/PUT /config
│   │   │   ├── demo.py                   # GET/PUT /demo
│   │   │   ├── learning.py               # Recognition, recommendations, workshops
│   │   │   ├── pipeline.py               # Run, status, GPTs, history
│   │   │   └── prompt_lab.py             # Dev tool — test KPI prompts
│   │   ├── services/
│   │   │   ├── classifier.py             # OpenAI LLM classifier
│   │   │   ├── compliance_api.py         # OpenAI Compliance API client
│   │   │   ├── demo_state.py             # In-memory demo toggle
│   │   │   ├── embedder.py               # OpenAI embeddings
│   │   │   ├── filter_engine.py          # Visibility / email / shared-user filters
│   │   │   ├── mock_classifier.py
│   │   │   ├── mock_data.py              # ~90 GPT templates across 10 departments
│   │   │   ├── mock_embedder.py
│   │   │   ├── mock_fetcher.py
│   │   │   ├── mock_semantic_enricher.py # Deterministic KPI scores for demo
│   │   │   ├── pipeline.py               # Orchestrates all stages
│   │   │   ├── prompt_lab_samples.py     # 20 realistic GPT samples for dev testing
│   │   │   └── semantic_enricher.py      # 9 LLM calls per GPT
│   │   └── static/
│   │       └── prompt_lab.html           # Standalone dev tool UI
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts                 # Fetch wrapper
│   │   │   └── learning.ts               # Typed wrappers for L&D endpoints
│   │   ├── App.tsx                       # Root — Leader / Employee / Wizard views
│   │   ├── components/
│   │   │   ├── employee/Portal.tsx       # Read-only GPT discovery
│   │   │   ├── layout/                   # Header, Stepper, NavButtons
│   │   │   ├── leader/
│   │   │   │   ├── Duplicates.tsx
│   │   │   │   ├── Enrichment.tsx
│   │   │   │   ├── GPTDrawer.tsx         # Slide-out GPT detail panel
│   │   │   │   ├── LeaderLayout.tsx
│   │   │   │   ├── Learning.tsx
│   │   │   │   ├── Overview.tsx
│   │   │   │   ├── QualityScores.tsx
│   │   │   │   ├── Recognition.tsx
│   │   │   │   ├── RiskPanel.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Workshops.tsx
│   │   │   │   └── sub/                  # Drill-down full-page views
│   │   │   │       ├── BuildersPage.tsx
│   │   │   │       ├── DepartmentsPage.tsx
│   │   │   │       ├── MaturityPage.tsx
│   │   │   │       ├── OutputTypesPage.tsx
│   │   │   │       └── ProcessesPage.tsx
│   │   │   ├── steps/                    # Wizard Step 1–4
│   │   │   └── ui/                       # ResultsView, shared UI
│   │   ├── contexts/ThemeContext.tsx
│   │   ├── hooks/                        # React Query hooks
│   │   └── types/index.ts                # TypeScript interfaces
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── scripts/
│   ├── db_queries.sql                    # Useful SQL queries
│   └── reset_registry.py                 # CLI tool to clear GPT data
├── docs/
│   └── erd.mmd                           # Entity-relationship diagram (Mermaid)
├── docker-compose.yml
└── .env.example
```

---

## API Endpoints

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/config` | Get configuration |
| PUT | `/api/v1/config` | Update configuration |
| POST | `/api/v1/config/test-connection` | Test Compliance API connection |

### Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pipeline/run` | Start pipeline |
| GET | `/api/v1/pipeline/status` | Live progress |
| GET | `/api/v1/pipeline/summary` | Results summary |
| GET | `/api/v1/pipeline/gpts` | List all GPTs |
| GET | `/api/v1/pipeline/history` | Sync history |
| GET | `/api/v1/pipeline/logs/{id}` | Logs for a sync run |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List categories |
| POST | `/api/v1/categories` | Create category |
| PUT | `/api/v1/categories/{id}` | Update category |
| DELETE | `/api/v1/categories/{id}` | Delete category |
| POST | `/api/v1/categories/seed` | Seed default categories |

### Clustering
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/clustering/run` | Run duplicate detection |
| GET | `/api/v1/clustering/status` | Clustering status |
| GET | `/api/v1/clustering/results` | Cluster groups |

### Learning & Development
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/learning/recognition` | Builder recognition scores |
| POST | `/api/v1/learning/recommend-org` | Org-wide learning recommendations |
| POST | `/api/v1/learning/recommend-employee` | Per-employee recommendations |
| GET | `/api/v1/learning/custom-courses` | List custom courses |
| POST | `/api/v1/learning/custom-courses/upload` | Add a course by URL |
| DELETE | `/api/v1/learning/custom-courses/{id}` | Remove a course |
| GET | `/api/v1/learning/workshops` | List workshops |
| POST | `/api/v1/learning/workshops` | Create workshop |
| PUT | `/api/v1/learning/workshops/{id}` | Update workshop |
| DELETE | `/api/v1/learning/workshops/{id}` | Delete workshop |
| POST | `/api/v1/learning/workshops/{id}/participants` | Add participant |
| DELETE | `/api/v1/learning/workshops/{id}/participants/{email}` | Remove participant |
| POST | `/api/v1/learning/workshops/{id}/tag-gpt` | Tag a GPT to workshop |
| DELETE | `/api/v1/learning/workshops/{id}/tag-gpt/{gpt_id}` | Untag a GPT |
| GET | `/api/v1/learning/workshops/{id}/impact` | Time-based quality impact |

### Demo & Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/demo` | Get demo state |
| PUT | `/api/v1/demo` | Toggle demo mode / set size |
| POST | `/api/v1/admin/reset` | Clear GPTs and logs |

### Prompt Lab *(dev tool)*
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prompt-lab/samples` | List 20 sample GPTs |
| GET | `/api/v1/prompt-lab/samples/{id}` | Get a single sample |
| GET | `/api/v1/prompt-lab/kpis` | List available KPI prompts |
| POST | `/api/v1/prompt-lab/enrich` | Run one KPI on one sample |
| POST | `/api/v1/prompt-lab/enrich-all` | Run all KPIs on one sample |

The Prompt Lab UI is served at `http://localhost:8000/prompt-lab` — a standalone HTML page for iterating on enrichment prompts without touching the main app.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FERNET_KEY` | Encryption key for API keys stored in DB | **required** — run `make fernet-key` |
| `POSTGRES_USER` | Database user | `gpt_registry` |
| `POSTGRES_PASSWORD` | Database password | `changeme` |
| `POSTGRES_DB` | Database name | `gpt_registry` |
| `DATABASE_URL` | Full async connection string | composed from above |
| `BACKEND_CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

This project is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE) for details.
