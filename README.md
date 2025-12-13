# MANOE - Distributed Multi-Agent Narrative Engine

A scalable, event-driven platform designed to automate the creation of exceptional narratives by strictly adhering to proven storytelling principles from the "Storyteller" framework.

## Features

- **Multi-Agent Architecture**: Specialized AI agents (Architect, Profiler, Strategist, Writer, Critic) collaborate to create narratives
- **BYOK (Bring Your Own Key)**: Support for OpenAI, OpenRouter, Google Gemini, and Anthropic Claude
- **Model Selection**: Choose different models for each agent based on your needs and budget
- **Self-Hosting Ready**: Complete Docker Compose setup for easy deployment
- **Vector Memory**: Qdrant integration for character and worldbuilding consistency
- **Moral Compass Framework**: Ethical, Unethical, Amoral, or Ambiguous narrative lenses

## Quick Start with Docker

The fastest way to get started is using Docker Compose:

```bash
# Clone the repository
git clone https://github.com/IShalkin/manoe.git
cd manoe

# Configure your API keys
cp .env.example .env
# Edit .env with your API keys (at least one LLM provider required)

# Start all services
docker-compose up -d

# Access the API at http://localhost:3000
```

## Supported LLM Providers (BYOK)

MANOE supports multiple LLM providers. Configure at least one:

| Provider | Models | Best For |
|----------|--------|----------|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-preview, o1-mini | General purpose, best quality |
| **OpenRouter** | Access to 100+ models from multiple providers | Cost optimization, model variety |
| **Google Gemini** | gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash | Long context (1M tokens) |
| **Anthropic Claude** | claude-3.5-sonnet, claude-3.5-haiku, claude-3-opus | Creative writing, safety |

### Per-Agent Model Configuration

Each agent can use a different provider and model:

```env
# High-capability models for complex reasoning
ARCHITECT_PROVIDER=openai
ARCHITECT_MODEL=gpt-4o

# Cost-effective model for high-volume drafting
WRITER_PROVIDER=openai
WRITER_MODEL=gpt-4o-mini

# Mix providers as needed
CRITIC_PROVIDER=claude
CRITIC_MODEL=claude-3-5-sonnet-20241022
```

## Architecture

The system employs a hybrid architecture with the following components:

| Component | Technology | Function |
|-----------|------------|----------|
| API Gateway | TypeScript + Ts.ED | Entry point, validation, user management |
| AI Orchestrator | Python | Manages agent collaboration and LLM calls |
| Message Broker | Redis | Decouples API from AI workers using Producer-Consumer pattern |
| Long-Term Memory | Qdrant | Stores worldbuilding and character attributes as vectors |
| Persistence | PostgreSQL | Stores plot outlines and audit logs |

## Project Structure

```
manoe/
├── api-gateway/           # TypeScript/Ts.ED API Gateway
│   ├── src/
│   │   ├── controllers/   # HTTP endpoint controllers
│   │   ├── services/      # Business logic services
│   │   ├── models/        # Data models and DTOs
│   │   ├── middleware/    # Authentication, validation
│   │   └── config/        # Configuration management
│   ├── package.json
│   └── tsconfig.json
├── orchestrator/          # Python/AutoGen AI Orchestrator
│   ├── agents/            # Agent definitions (Architect, Writer, Critic)
│   ├── prompts/           # System prompts derived from Storyteller
│   ├── memory/            # Qdrant vector memory integration
│   ├── models/            # Pydantic data models
│   ├── services/          # Redis queue, Supabase integration
│   └── config/            # Configuration management
├── shared/                # Shared types and utilities
│   ├── types/             # TypeScript/Python shared type definitions
│   └── utils/             # Common utilities
├── docs/                  # Documentation
│   ├── ARCHITECTURE.md    # Detailed architecture documentation
│   ├── API.md             # API documentation
│   └── AGENTS.md          # Agent behavior documentation
└── infrastructure/        # Docker, deployment configs
    ├── docker-compose.yml
    └── .env.example
```

## Agentic Workflow

The system implements a four-phase narrative generation workflow:

### Phase 1: Genesis (Architect Agent)
- Accepts "Seed Idea" from user (What If? questions, image prompts)
- Configures "Moral Compass" (Ethical, Unethical, Amoral, Ambiguous)
- Generates structured "Narrative Possibility" JSON

### Phase 2: Character & World Design (Profiler Agent)
- Assigns archetypes (Hero, Shadow, Trickster) to characters
- Generates "Core Psychological Wound" and "Inner Trap" for protagonists
- Stores character attributes as vectors in Qdrant

### Phase 3: Plotting & Outlining (Strategist Agent)
- Maps plot onto "Mythic Structure" (Hero's Journey, Three-Act Structure)
- Creates scene-by-scene outline with conflict, emotional beats, and subtext

### Phase 4: Drafting & Critique Loop (Writer + Critic Agents)
- Writer drafts scenes using "Show, Don't Tell" principles
- Critic validates pacing, originality, dialogue, and subtext
- Iterative refinement until quality standards are met

## Prerequisites

- Node.js 20+
- Python 3.11+
- Redis (running on VPS)
- Qdrant (running on VPS)
- Supabase (running on VPS)

## Quick Start

### API Gateway Setup

```bash
cd api-gateway
npm install
cp .env.example .env
# Configure environment variables
npm run dev
```

### Orchestrator Setup

```bash
cd orchestrator
poetry install
cp .env.example .env
# Configure environment variables
poetry run python main.py
```

## Environment Variables

### API Gateway
- `PORT` - Server port (default: 3000)
- `REDIS_URL` - Redis connection URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service key

### Orchestrator
- `OPENAI_API_KEY` - OpenAI API key for LLM
- `REDIS_URL` - Redis connection URL
- `QDRANT_URL` - Qdrant server URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service key

## API Endpoints

### Project Management
- `POST /api/project/init` - Initialize new narrative project
- `GET /api/project/:id` - Get project status and details
- `POST /api/project/:id/approve` - Approve current phase and proceed

### Generation
- `POST /api/generate/characters` - Generate character profiles
- `POST /api/generate/outline` - Generate plot outline
- `POST /api/generate/draft` - Generate narrative draft

### Memory
- `GET /api/memory/characters/:projectId` - Retrieve character vectors
- `GET /api/memory/worldbuilding/:projectId` - Retrieve worldbuilding vectors

## Success Metrics

- **Structural Adherence**: 100% of scenes match the generated outline
- **Psychological Depth**: Every protagonist has defined "Inner Trap" and "Breaking Point"
- **Sensory Density**: Every scene contains at least 3 distinct sensory details

## License

MIT License

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.
