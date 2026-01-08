# MANOE Architecture Documentation

## System Overview

MANOE (Multi-Agent Narrative Orchestration Engine) is a distributed system designed to generate high-quality narratives through specialized AI agents. The architecture follows an event-driven microservices pattern with clear separation of concerns.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Applications                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (TypeScript/Ts.ED)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Controllers │  │  Services   │  │ Middleware  │  │   Models    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│         Redis (Message Broker)   │   │      Supabase (PostgreSQL)          │
│  ┌───────────┐  ┌───────────┐   │   │  ┌─────────┐  ┌─────────────────┐   │
│  │  Queues   │  │  Pub/Sub  │   │   │  │ Projects│  │   Audit Logs    │   │
│  └───────────┘  └───────────┘   │   │  └─────────┘  └─────────────────┘   │
└─────────────────────────────────┘   └─────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   StorytellerOrchestrator (TypeScript/Ts.ED)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Architect  │  │   Profiler  │  │  Strategist │  │Writer/Critic│        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Qdrant (Vector Database)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Characters    │  │  Worldbuilding  │  │    Scenes       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. API Gateway (TypeScript/Ts.ED)

The API Gateway serves as the entry point for all client requests. Built with Ts.ED framework for enterprise-grade TypeScript support.

**Responsibilities:**
- Request validation and sanitization
- Authentication and authorization
- Rate limiting and throttling
- Job queue management (Redis producer)
- WebSocket connections for real-time updates

**Key Controllers:**
- `ProjectController` - Project lifecycle management
- `GenerationController` - Trigger generation phases
- `MemoryController` - Query vector memory
- `WebhookController` - External integrations

**Services:**
- `JobQueueService` - Redis queue producer
- `SupabaseService` - Database operations
- `AuthService` - JWT authentication

### 2. StorytellerOrchestrator (TypeScript/Ts.ED)

The orchestrator manages the multi-agent generation workflow. All agents are implemented in TypeScript within the api-gateway service.

**Agent Roles:**

#### Architect Agent
- **Phase:** Genesis, Outlining
- **Input:** Seed idea, moral compass configuration
- **Output:** Narrative possibility JSON, scene outline
- **Prompt Focus:** Genesis phase, ethical framework application, mythic structure

#### Profiler Agent
- **Phase:** Characters
- **Input:** Narrative possibility, target audience
- **Output:** Character profiles with psychological depth
- **Prompt Focus:** Archetypal mapping, psychological wounds

#### Worldbuilder Agent
- **Phase:** Worldbuilding
- **Input:** Characters, narrative structure
- **Output:** World elements (geography, cultures, rules)
- **Prompt Focus:** Setting details, atmosphere, world rules

#### Strategist Agent
- **Phase:** Advanced Planning
- **Input:** Outline, characters, worldbuilding
- **Output:** Detailed scene plans
- **Prompt Focus:** Conflict layering, emotional beats

#### Writer Agent
- **Phase:** Drafting, Revision
- **Input:** Outline, character profiles, worldbuilding, Qdrant context
- **Output:** Draft scenes with embeddings
- **Prompt Focus:** Show don't tell, sensory details, subtext

#### Critic Agent
- **Phase:** Critique
- **Input:** Draft scenes, quality criteria
- **Output:** Score (1-10) and feedback
- **Prompt Focus:** Artistic critique, pacing, originality

#### Archivist Agent
- **Phase:** Runs every 3 scenes
- **Input:** Raw facts from recent scenes
- **Output:** Updated Key Constraints
- **Prompt Focus:** Continuity tracking, world state updates

### 3. Redis (Message Broker)

Redis handles asynchronous communication between the API Gateway and AI Orchestrator.

**Queue Structure:**
```
manoe:jobs:pending      # Pending generation jobs
manoe:jobs:processing   # Currently processing jobs
manoe:jobs:completed    # Completed jobs (TTL: 24h)
manoe:jobs:failed       # Failed jobs for retry
```

**Pub/Sub Channels:**
```
manoe:events:project    # Project lifecycle events
manoe:events:generation # Generation progress events
manoe:events:agent      # Agent activity events
```

### 4. Qdrant (Vector Database)

Qdrant stores embeddings for semantic retrieval during generation.

**Collections:**

#### characters
- Character profiles with psychological attributes
- Visual signatures and defining traits
- Relationships and affiliations

#### worldbuilding
- Geography and culture details
- Historical events and lore
- Rules and constraints of the story world

#### scenes
- Generated scene content
- Emotional beats and subtext layers
- Continuity references

**Embedding Strategy:**
- OpenAI `text-embedding-3-small` for text content
- Metadata filtering for project/character scoping
- Hybrid search (dense + sparse) for precision

### 5. Supabase (PostgreSQL)

Supabase provides relational storage and real-time subscriptions.

**Schema:**

```sql
-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    seed_idea TEXT NOT NULL,
    moral_compass VARCHAR(50) NOT NULL,
    target_audience TEXT,
    status VARCHAR(50) DEFAULT 'genesis',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters table
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    archetype VARCHAR(100),
    core_motivation TEXT,
    inner_trap TEXT,
    psychological_wound TEXT,
    visual_signature TEXT,
    qdrant_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Outlines table
CREATE TABLE outlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    structure_type VARCHAR(100),
    scenes JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drafts table
CREATE TABLE drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    sensory_details JSONB,
    subtext_layer TEXT,
    emotional_shift TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    revision_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    token_usage JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Data Flow

### Generation Flow

```
1. Client → POST /orchestrate/generate
2. API Gateway validates request and creates project in Supabase
3. StorytellerOrchestrator starts generation run
4. Orchestrator publishes generation_started event to Redis Streams
5. Client connects to SSE endpoint /orchestrate/stream/{runId}
6. For each phase:
   a. Orchestrator executes appropriate agent
   b. Agent calls LLM via LLMProviderService
   c. Results stored in Supabase (run_artifacts table)
   d. Embeddings stored in Qdrant (characters, worldbuilding, scenes)
   e. Events published to Redis Streams → SSE to client
7. On completion, generation_complete event sent
```

### SSE Event Flow

```
1. Client connects to /orchestrate/stream/{runId}
2. API Gateway subscribes to Redis Streams for run:{runId}
3. Events streamed to client in real-time:
   - generation_started
   - phase_start
   - agent_start
   - agent_complete
   - new_developments_collected (Archivist)
   - generation_complete
4. Heartbeat sent every 15 seconds to keep connection alive
```

### Critique Loop Flow

```
1. Writer Agent generates scene draft
2. Draft stored in Supabase
3. Critic Agent evaluates draft
4. If rejected:
   a. Feedback stored in audit log
   b. Writer Agent revises
   c. Loop continues
5. If approved:
   a. Scene marked as final
   b. Next scene triggered
```

## Error Handling

### Retry Strategy
- Exponential backoff for transient failures
- Maximum 3 retries per job
- Dead letter queue for persistent failures

### Circuit Breaker
- OpenAI API rate limiting protection
- Qdrant connection pooling
- Redis connection recovery

## Scalability Considerations

### Horizontal Scaling
- API Gateway: Multiple instances behind load balancer
- Orchestrator: Multiple workers consuming from Redis
- Qdrant: Cluster mode for large vector collections

### Caching Strategy
- Redis caching for frequently accessed data
- Qdrant result caching for repeated queries
- API response caching for static content

## Security

### Authentication
- JWT tokens for API access
- API key authentication for service-to-service
- Supabase Row Level Security (RLS)

### Data Protection
- Encryption at rest (Supabase, Qdrant)
- TLS for all network communication
- Secrets management via environment variables

## Monitoring

### Metrics
- Request latency and throughput
- Agent processing time
- Token usage per generation
- Queue depth and processing rate

### Logging
- Structured JSON logging
- Correlation IDs for request tracing
- Audit logs for agent decisions

### Alerting
- Queue backlog thresholds
- Error rate spikes
- API latency degradation
