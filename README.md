<p align="center">
  <img src="docs/logo.svg" alt="AgentsOrg.ai" width="320" />
</p>

<p align="center">
  <strong>Open-source AI governance platform for ChatGPT Enterprise</strong><br/>
  Discover every GPT in your workspace. Score them. Flag risks. Develop your people.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License" /></a>
  <a href="docker-compose.yml"><img src="https://img.shields.io/badge/deploy-Docker_Compose-2496ED?logo=docker&logoColor=white" alt="Docker" /></a>
  <a href="https://github.com/ori129/agentsorg/commits/main"><img src="https://img.shields.io/github/last-commit/ori129/agentsorg" alt="Last Commit" /></a>
  <a href="https://github.com/ori129/agentsorg/stargazers"><img src="https://img.shields.io/github/stars/ori129/agentsorg?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

## What is AgentsOrg.ai?

AgentsOrg.ai connects to the **OpenAI Compliance API** and gives your organization a complete picture of every Custom GPT and Project it has built — scored, risk-flagged, and mapped to business processes.

OpenAI's built-in analytics tells you **how much** people use ChatGPT. AgentsOrg.ai tells you **how good** your GPTs are — and what to do about it.

> **Self-hosted. Your data never leaves your infrastructure.**

---

## Features

### 🔍 GPT & Project Registry
Automatically discovers all Custom GPTs and Projects across your ChatGPT Enterprise workspace via the OpenAI Compliance API. Full-text search, filters, and a slide-out detail panel for every asset.

### 🧠 Semantic Enrichment (9 KPIs per GPT)
An LLM reads each GPT's system prompt and extracts:

| Signal | What it captures |
|--------|-----------------|
| `risk_level` + `risk_flags` | Data exposure, compliance concerns |
| `sophistication_score` | Depth of prompt and tooling (1–5) |
| `prompting_quality_score` | Prompt engineering quality (1–5) |
| `business_process` | Which workflow this GPT automates |
| `roi_potential_score` | Estimated business value (1–5) |
| `intended_audience` | Who the GPT is built for |
| `integration_flags` | External systems connected |
| `output_type` | Document, Analysis, Code, Conversation, etc. |
| `adoption_friction_score` | How easy it is for others to adopt (1–5) |

### 📊 Leader Dashboard
- **Overview** — portfolio KPIs, creation velocity, department breakdown, maturity tiers. Five drill-down pages (Builders, Processes, Departments, Maturity, Output Types).
- **Sync** — Manual sync button, auto-sync toggle + schedule, token consumption and cost per sync run, and full sync history log.
- **Risk Panel** — GPTs flagged high or critical, with per-flag breakdown.
- **Duplicates** — pgvector semantic clustering to detect redundant builds before they proliferate.
- **Quality Scores** — Prompting quality distribution across the portfolio.

### 🎓 Learning & Development
- **Recognition** — Composite builder scores: quality 35% · adoption 25% · hygiene 25% · volume 15%.
- **Learning** — LLM-driven course recommendations per builder, grounded in actual KPI gaps. Built-in OpenAI Academy catalog; custom courses via URL.
- **Workshops** — CRUD for sessions with participant lists, GPT tagging, and time-based quality impact correlation.

### 👤 Employee Portal
Read-only GPT discovery for non-admin users — search and browse what's available without accessing governance data.

### 🎯 Demo Mode
Run the full pipeline with realistic mock data — no API keys needed. 500 GPTs across 10 departments, fully enriched with scores and rationale. One click from the onboarding screen.

---

## Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/ss_onboarding.png" alt="Sign in" /></td>
    <td><img src="docs/screenshots/ss_overview.png" alt="AI Portfolio Overview" /></td>
  </tr>
  <tr>
    <td align="center"><em>Sign in — self-hosted, your data stays on your infra</em></td>
    <td align="center"><em>Overview — portfolio KPIs, velocity, department breakdown</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_overview_builders.png" alt="Builders" /></td>
    <td><img src="docs/screenshots/ss_overview_processes.png" alt="Business Processes" /></td>
  </tr>
  <tr>
    <td align="center"><em>Builders — who's building what across the org</em></td>
    <td align="center"><em>Business Processes — AI mapped to workflows</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_overview_departments.png" alt="Departments" /></td>
    <td><img src="docs/screenshots/ss_overview_maturity.png" alt="Maturity Tiers" /></td>
  </tr>
  <tr>
    <td align="center"><em>Departments — AI adoption by team</em></td>
    <td align="center"><em>Maturity Tiers — Production / Functional / Experimental breakdown</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_overview_output_types.png" alt="Output Types" /></td>
    <td><img src="docs/screenshots/ss_risk.png" alt="Risk Panel" /></td>
  </tr>
  <tr>
    <td align="center"><em>Output Types — Document, Code, Analysis, Conversation…</em></td>
    <td align="center"><em>Risk Panel — high/critical assets flagged by issue type</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_duplicates.png" alt="Duplicates" /></td>
    <td><img src="docs/screenshots/ss_quality.png" alt="Quality Scores" /></td>
  </tr>
  <tr>
    <td align="center"><em>Duplicates — semantic clustering catches redundant builds</em></td>
    <td align="center"><em>Quality Scores — sophistication, prompting quality, ROI per asset</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_recognition.png" alt="Builder Recognition" /></td>
    <td><img src="docs/screenshots/ss_learning.png" alt="Learning" /></td>
  </tr>
  <tr>
    <td align="center"><em>Recognition — composite builder scores across your team</em></td>
    <td align="center"><em>Learning — LLM-driven course recommendations per builder</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_workshops.png" alt="Workshops" /></td>
    <td><img src="docs/screenshots/ss_sync.png" alt="Sync" /></td>
  </tr>
  <tr>
    <td align="center"><em>Workshops — sessions with participant lists and GPT tagging</em></td>
    <td align="center"><em>Sync — manual sync, auto-sync schedule, token cost history</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ss_pipeline_setup.png" alt="Pipeline Setup" /></td>
    <td><img src="docs/screenshots/ss_users.png" alt="Users" /></td>
  </tr>
  <tr>
    <td align="center"><em>Pipeline Setup — one-time wizard: API config, filters, categories</em></td>
    <td align="center"><em>Users — roster management and role assignment</em></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/ss_employee.png" alt="Employee Portal" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><em>Employee Portal — read-only GPT & Project discovery for the whole org</em></td>
  </tr>
</table>

---

## Quick Start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. Clone the repo
git clone https://github.com/ori129/agentsorg.git
cd agentsorg

# 2. Create your .env file
cp .env.example .env

# 3. Generate a Fernet encryption key and paste it into FERNET_KEY= in .env
make fernet-key

# 4. Start all services (migrations run automatically on first boot)
make up

# 5. Open the app  (macOS)
open http://localhost:3000
# or just visit http://localhost:3000 in your browser
```

Register with any email → choose **Try Demo** on the onboarding screen to explore with 500 realistic GPTs instantly, or **Connect to Production** to enter your OpenAI credentials and scan your real workspace.

Run `make help` to see all available commands.

---

## How It Works

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
          Compliance     Chat API     Embeddings
            API         (classify +    (vectors +
                         enrich)       clustering)
```

### Pipeline Stages

```
Fetch (5–30%) → Filter (35%) → Classify (40–65%) → Enrich (65–72%) → Embed (75–85%) → Store (90%) → Done (100%)
```

**Incremental processing** — GPTs are content-hashed (SHA-256) on each run. Unchanged GPTs skip classification, enrichment, and embedding, carrying forward their cached results. This avoids redundant OpenAI API costs on subsequent syncs.

| Stage    | Production                    | Demo                         |
|----------|-------------------------------|------------------------------|
| Fetch    | OpenAI Compliance API         | Template-based generator     |
| Classify | OpenAI Chat model             | Keyword matching             |
| Enrich   | 9× LLM calls per GPT          | Deterministic mock enricher  |
| Embed    | OpenAI Embeddings API         | Deterministic vectors        |

### Maturity Tiers

| Tier | Sophistication | Description |
|------|---------------|-------------|
| Production | ≥ 4 | Full system prompts, integrations, tested |
| Functional | 3 | Useful, room to grow |
| Experimental | ≤ 2 | Early-stage or abandoned |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, TanStack Query, Vite |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 + pgvector |
| Auth | Session-based, role-aware (`system-admin`, `ai-leader`, `employee`) |
| Deployment | Docker Compose (3 services, zero external dependencies) |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FERNET_KEY` | Encryption key for API credentials stored in DB | **required** — run `make fernet-key` |
| `POSTGRES_USER` | Database user | `agentsorg` |
| `POSTGRES_PASSWORD` | Database password | `changeme` |
| `POSTGRES_DB` | Database name | `agentsorg` |
| `DATABASE_URL` | Full async connection string | composed from above |
| `BACKEND_CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

---

## API Reference

<details>
<summary><strong>Configuration</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/config` | Get configuration |
| PUT | `/api/v1/config` | Update configuration |
| POST | `/api/v1/config/test-connection` | Test Compliance API connection |
| POST | `/api/v1/config/test-openai-connection` | Test OpenAI API connection |
</details>

<details>
<summary><strong>Pipeline</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pipeline/run` | Start pipeline |
| GET | `/api/v1/pipeline/status` | Live progress + stage |
| GET | `/api/v1/pipeline/summary` | Results summary |
| GET | `/api/v1/pipeline/gpts` | List all GPTs |
| GET | `/api/v1/pipeline/history` | Sync history |
| GET | `/api/v1/pipeline/logs/{id}` | Logs for a sync run |
| GET | `/api/v1/pipeline/sync-config` | Get auto-sync settings |
| PATCH | `/api/v1/pipeline/sync-config` | Update auto-sync settings |
</details>

<details>
<summary><strong>Categories</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List categories |
| POST | `/api/v1/categories` | Create category |
| PUT | `/api/v1/categories/{id}` | Update category |
| DELETE | `/api/v1/categories/{id}` | Delete category |
| POST | `/api/v1/categories/seed` | Seed default categories |
</details>

<details>
<summary><strong>Clustering</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/clustering/run` | Run duplicate detection |
| GET | `/api/v1/clustering/status` | Clustering job status |
| GET | `/api/v1/clustering/results` | Cluster groups |
</details>

<details>
<summary><strong>Learning & Development</strong></summary>

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
</details>

<details>
<summary><strong>Users & Admin</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users` | List workspace users |
| POST | `/api/v1/users/import` | Import users from Compliance API |
| PATCH | `/api/v1/users/{id}/role` | Update user system role |
| GET | `/api/v1/demo` | Get demo state |
| PUT | `/api/v1/demo` | Toggle demo mode / set size |
| POST | `/api/v1/admin/reset` | Full reset — clears GPTs, logs, categories, workshops |
</details>

---

## Project Structure

```
├── backend/
│   ├── alembic/versions/          # DB migrations (auto-applied on startup)
│   ├── app/
│   │   ├── main.py                # FastAPI app entry point
│   │   ├── models/models.py       # ORM models
│   │   ├── schemas/schemas.py     # Pydantic request/response models
│   │   ├── routers/               # One file per domain (pipeline, learning, users…)
│   │   └── services/
│   │       ├── pipeline.py        # Orchestrates all pipeline stages
│   │       ├── semantic_enricher.py   # 9 LLM calls per GPT
│   │       ├── compliance_api.py  # OpenAI Compliance API client
│   │       ├── embedder.py        # OpenAI embeddings
│   │       ├── classifier.py      # OpenAI LLM classifier
│   │       ├── filter_engine.py   # Visibility / email / shared-user filters
│   │       └── mock_*/            # Demo mode equivalents (no API calls)
├── frontend/
│   └── src/
│       ├── App.tsx                # Root — Leader / Employee views + onboarding
│       ├── components/
│       │   ├── auth/              # Register, Login, Onboarding screens
│       │   ├── leader/            # Dashboard views (Overview, Sync, Risk, L&D…)
│       │   ├── employee/          # Read-only GPT portal
│       │   ├── steps/             # Pipeline setup wizard (Steps 1–4)
│       │   └── layout/            # Header, Sidebar, DemoBanner
│       ├── hooks/                 # React Query hooks
│       └── types/index.ts         # TypeScript interfaces
├── docs/
│   ├── erd.mmd                    # Entity-relationship diagram (Mermaid)
│   └── screenshots/               # README screenshots (demo data)
├── docker-compose.yml
├── Makefile
└── .env.example
```

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes and ensure the app builds: `make up`
3. Open a pull request with a clear description

Run `make help` to see all available dev commands.

---

## License

Licensed under the **Apache License 2.0** — see [LICENSE](LICENSE) for details.
