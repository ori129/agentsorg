# Contributing to AgentsOrg

Thanks for your interest in contributing! Here's how to get started.

---

## License and Legal

### Apache License 2.0

This project is licensed under the **Apache License 2.0** — an OSI-approved open source license.

What this means for contributors:

- You can use, modify, distribute, and contribute freely
- No restrictions on commercial or production use
- Attribution is required when distributing

### Contributor License Agreement (CLA)

All contributors must sign the CLA before their pull request can be merged.

- **Individuals**: Read [CLA-individual.md](CLA-individual.md)
- **Corporate contributors**: Read [CLA-corporate.md](CLA-corporate.md)

**How to sign**: When you open a pull request, a bot will automatically post a comment.
Reply to that comment with:

> I have read the CLA Document and I hereby sign the CLA

Your GitHub username and timestamp will be recorded. You only need to sign once.

**Why a CLA?** Without it, contributors retain full copyright over their work by default.
The CLA gives the project owner the rights needed to relicense, dual-license, or offer
commercial licenses for the full codebase — including your contributions.
You retain copyright ownership; you're just granting us a broad license to use your work.

---

## Prerequisites

- Docker Desktop
- Git

## Local Development

```bash
# Clone the repo
git clone https://github.com/ori129/agentsorg.git
cd agentsorg

# Set up environment
cp .env.example .env
make fernet-key  # Copy output into FERNET_KEY in .env

# Start services
make up

# Open the app
open http://localhost:3000
```

## Useful Commands

```bash
make help       # List all available commands
make logs       # Tail service logs
make shell      # Open a shell in the backend container
make reset      # Clear GPT data
make down       # Stop all services
```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Test locally with `make up`
4. Use demo mode (toggle in header) to test without API keys
5. Open a pull request — the CLA bot will prompt you to sign if you haven't yet

## Code Style

- **Backend**: Python 3.12, type hints, async/await
- **Frontend**: TypeScript, React functional components, Tailwind CSS

## Reporting Issues

Use [GitHub Issues](https://github.com/ori129/agentsorg/issues) with the provided templates.
