from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Literal
from openai import OpenAI
import httpx
import json
import asyncio

app = FastAPI(title="MANOE API", description="Multi-Agent Narrative Orchestration Engine")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class GenerateRequest(BaseModel):
    provider: Literal["openai", "openrouter", "gemini", "anthropic"]
    model: str
    api_key: str
    seed_idea: str
    moral_compass: Literal["ethical", "unethical", "amoral", "ambiguous"]
    target_audience: Optional[str] = None
    themes: Optional[str] = None
    project_name: Optional[str] = None

class GenerateResponse(BaseModel):
    success: bool
    content: Optional[str] = None
    error: Optional[str] = None

STORYTELLER_SYSTEM_PROMPT = """You are a master storyteller and narrative architect. Your role is to create compelling, psychologically rich narratives based on the user's seed idea.

Follow these principles:
1. **Moral Compass**: Apply the specified moral lens to shape the narrative's ethical framework
2. **Psychological Depth**: Create characters with inner contradictions, core wounds, and coping mechanisms
3. **Show, Don't Tell**: Use sensory details (sight, sound, smell, taste, touch) to immerse readers
4. **Subtext**: Layer dialogue with hidden meanings and unspoken tensions
5. **Structure**: Follow classic narrative arcs while maintaining originality

Generate a detailed narrative outline including:
- Story premise and hook
- Main characters with psychological profiles
- Three-act structure with key plot points
- Core themes and how they manifest
- Opening scene draft with sensory details"""

def get_moral_compass_guidance(moral_compass: str) -> str:
    guidance = {
        "ethical": "Focus on virtue, justice, and moral clarity. Characters should face ethical dilemmas that ultimately affirm positive values.",
        "unethical": "Explore darkness, taboos, and moral transgression. Characters may embrace or be consumed by their darker impulses.",
        "amoral": "Adopt a non-judgmental, observational stance. Present events without moral commentary, letting readers draw conclusions.",
        "ambiguous": "Create complex moral dilemmas with no clear right answer. Characters should face choices where every option has costs."
    }
    return guidance.get(moral_compass, guidance["ambiguous"])

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/api/health")
async def api_health():
    return {"status": "ok", "service": "manoe-api"}

@app.post("/api/generate", response_model=GenerateResponse)
async def generate_story(request: GenerateRequest):
    """Generate a narrative based on the seed idea and parameters."""
    
    moral_guidance = get_moral_compass_guidance(request.moral_compass)
    
    user_prompt = f"""Create a narrative based on this seed idea:

**Seed Idea**: {request.seed_idea}

**Moral Compass**: {request.moral_compass.capitalize()}
{moral_guidance}

**Target Audience**: {request.target_audience or "General adult readers"}

**Core Themes**: {request.themes or "To be determined based on the seed idea"}

Please generate a comprehensive narrative outline with character profiles and an opening scene."""

    try:
        if request.provider == "openai":
            client = OpenAI(api_key=request.api_key)
            response = client.chat.completions.create(
                model=request.model,
                messages=[
                    {"role": "system", "content": STORYTELLER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=4000,
                temperature=0.8
            )
            content = response.choices[0].message.content
            
        elif request.provider == "openrouter":
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://manoe.iliashalkin.com",
                        "X-Title": "MANOE"
                    },
                    json={
                        "model": request.model,
                        "messages": [
                            {"role": "system", "content": STORYTELLER_SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt}
                        ],
                        "max_tokens": 4000,
                        "temperature": 0.8
                    },
                    timeout=120.0
                )
                if response.status_code != 200:
                    return GenerateResponse(success=False, error=f"OpenRouter API error: {response.text}")
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                
        elif request.provider == "gemini":
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{request.model}:generateContent?key={request.api_key}",
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [
                            {"role": "user", "parts": [{"text": f"{STORYTELLER_SYSTEM_PROMPT}\n\n{user_prompt}"}]}
                        ],
                        "generationConfig": {
                            "maxOutputTokens": 4000,
                            "temperature": 0.8
                        }
                    },
                    timeout=120.0
                )
                if response.status_code != 200:
                    return GenerateResponse(success=False, error=f"Gemini API error: {response.text}")
                data = response.json()
                content = data["candidates"][0]["content"]["parts"][0]["text"]
                
        elif request.provider == "anthropic":
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": request.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": request.model,
                        "max_tokens": 4000,
                        "system": STORYTELLER_SYSTEM_PROMPT,
                        "messages": [
                            {"role": "user", "content": user_prompt}
                        ]
                    },
                    timeout=120.0
                )
                if response.status_code != 200:
                    return GenerateResponse(success=False, error=f"Anthropic API error: {response.text}")
                data = response.json()
                content = data["content"][0]["text"]
        else:
            return GenerateResponse(success=False, error=f"Unsupported provider: {request.provider}")
            
        return GenerateResponse(success=True, content=content)
        
    except Exception as e:
        return GenerateResponse(success=False, error=str(e))
