# MANOE VPS Deployment Guide

This guide covers deploying MANOE on a VPS with Docker and nginx-proxy for automatic SSL.

## Prerequisites

- VPS with Docker and Docker Compose installed
- nginx-proxy network set up (typically named `complete-deploy_proxy`)
- Domain names configured with DNS pointing to your VPS

## Quick Start

```bash
# Clone the repository
git clone https://github.com/IShalkin/manoe.git
cd manoe

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys and domain names

# Start all services
docker-compose -f docker-compose.vps.yml up -d
```

## Critical Configuration Notes

### Qdrant Vector Database

Qdrant is used for semantic memory storage (characters, worldbuilding, scenes). The following configuration is critical to prevent issues:

#### File Descriptor Limits (ulimits)

Without proper ulimits, Qdrant will crash with "Too many open files" errors under load. The docker-compose.vps.yml includes the correct configuration:

```yaml
qdrant:
  image: qdrant/qdrant:v1.7.4
  ulimits:
    nofile:
      soft: 65535
      hard: 65535
```

If running Qdrant manually with `docker run`, include the ulimits flag:

```bash
docker run -d \
  --name qdrant \
  --network complete-deploy_proxy \
  --restart unless-stopped \
  --ulimit nofile=65535:65535 \
  -v qdrant-data:/qdrant/storage \
  -e QDRANT__SERVICE__API_KEY=${QDRANT_API_KEY} \
  -e QDRANT__SERVICE__HTTP_PORT=6333 \
  -e QDRANT__SERVICE__GRPC_PORT=6334 \
  qdrant/qdrant:v1.7.4
```

#### Network Configuration

Qdrant must be on the same Docker network as the api-gateway. The api-gateway connects to Qdrant using the container name:

```
QDRANT_URL=http://qdrant:6333
```

Do NOT use `localhost:6333` - this will fail inside Docker containers.

#### Verification

After starting Qdrant, verify it's working from inside the api-gateway container:

```bash
docker exec manoe-api-gateway curl -s \
  -H "api-key: ${QDRANT_API_KEY}" \
  http://qdrant:6333/collections
```

Expected response:
```json
{"result":{"collections":[...]},"status":"ok"}
```

### Langfuse Observability

Langfuse provides LLM tracing and prompt management. Important configuration:

#### Internal vs External URLs

The api-gateway must use the internal Docker network URL to connect to Langfuse:

```
LANGFUSE_HOST=http://langfuse-web:3000
```

Do NOT use the public URL (e.g., `https://langfuse.yourdomain.com`) as it may be protected by basic auth or have SSL issues.

#### API Keys

Create API keys in the Langfuse dashboard and add them to your `.env`:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

### Supabase Configuration

The api-gateway connects to Supabase via Kong:

```
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_KEY=<service_role_key>
```

#### Row Level Security (RLS)

Ensure the `service_role` has proper permissions on tables:

```sql
-- Run in Supabase SQL editor
GRANT ALL ON characters TO service_role;
GRANT ALL ON worldbuilding TO service_role;
GRANT ALL ON drafts TO service_role;

-- Create RLS policies for service_role
CREATE POLICY "service_role_all_characters" ON characters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_worldbuilding" ON worldbuilding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_drafts" ON drafts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

After running GRANT commands, restart PostgREST to refresh the schema cache:

```bash
docker restart supabase-rest
```

## Environment Variables

Required environment variables in `.env`:

```bash
# Qdrant
QDRANT_API_KEY=your-secure-api-key
QDRANT_DOMAIN=qdrant.yourdomain.com

# Supabase
SUPABASE_KEY=your-service-role-key

# Langfuse
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# LLM Providers (at least one required)
OPENAI_API_KEY=sk-...

# SSL/Domain
LETSENCRYPT_EMAIL=admin@yourdomain.com
```

## Troubleshooting

### "Too many open files" Error

Qdrant has exhausted file descriptors. Restart with proper ulimits:

```bash
docker stop qdrant && docker rm qdrant
# Recreate with --ulimit nofile=65535:65535
```

### 504 Gateway Timeout

Usually indicates Qdrant is down or unreachable. Check:

```bash
docker logs qdrant --tail 50
docker exec manoe-api-gateway curl http://qdrant:6333/
```

### Langfuse "Invalid credentials" or HTML Response

Check that:
1. `LANGFUSE_HOST` uses internal URL (`http://langfuse-web:3000`)
2. API keys are correct and not expired
3. Langfuse container is healthy: `docker logs langfuse-web --tail 20`

### Supabase 404 or Permission Denied

1. Restart PostgREST: `docker restart supabase-rest`
2. Restart Kong: `docker restart supabase-kong`
3. Verify RLS policies are created (see above)

### Kong DNS Cache Issues

After restarting containers, Kong may cache old DNS entries:

```bash
docker restart supabase-kong
```

## Service Ports

| Service | Internal Port | External Access |
|---------|--------------|-----------------|
| api-gateway | 3000 | Via nginx-proxy |
| Qdrant HTTP | 6333 | Via nginx-proxy (optional) |
| Qdrant gRPC | 6334 | Internal only |
| Langfuse | 3000 | Via nginx-proxy |
| Redis | 6379 | Internal only |

## Health Checks

Verify all services are healthy:

```bash
# API Gateway
curl https://manoe-gateway.yourdomain.com/api/health

# Qdrant (from inside network)
docker exec manoe-api-gateway curl http://qdrant:6333/

# Langfuse
curl https://langfuse.yourdomain.com/api/public/health
```
