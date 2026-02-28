# Contributing to GPT Registry

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- Docker Desktop
- Git

## Local Development

```bash
# Clone the repo
git clone https://github.com/aarbiv/CuatomGPT-Mapping.git
cd CuatomGPT-Mapping

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
5. Open a pull request

## Code Style

- **Backend**: Python 3.12, type hints, async/await
- **Frontend**: TypeScript, React functional components, Tailwind CSS

## Reporting Issues

Use [GitHub Issues](https://github.com/aarbiv/CuatomGPT-Mapping/issues) with the provided templates.
