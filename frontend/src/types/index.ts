export type LLMProvider = 'openai' | 'openrouter' | 'gemini' | 'anthropic' | 'deepseek' | 'venice';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  capabilities: string[];
  recommended?: string[];
}

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  isValid?: boolean;
}

export interface AgentConfig {
  agent: string;
  provider: LLMProvider;
  model: string;
}

export interface UserSettings {
  providers: ProviderConfig[];
  agents: AgentConfig[];
}

export type MoralCompass = 'ethical' | 'unethical' | 'amoral' | 'ambiguous';

export interface Project {
  id: string;
  name: string;
  seedIdea: string;
  moralCompass: MoralCompass;
  targetAudience: string;
  themes: string[];
  status: 'draft' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  archetype: string;
  coreMotivation: string;
  innerTrap: string;
  copingMechanism: string;
  visualSignature: string;
}

export const PROVIDERS: { id: LLMProvider; name: string; icon: string }[] = [
  { id: 'openai', name: 'OpenAI', icon: 'O' },
  { id: 'openrouter', name: 'OpenRouter', icon: 'R' },
  { id: 'gemini', name: 'Google Gemini', icon: 'G' },
  { id: 'anthropic', name: 'Anthropic Claude', icon: 'A' },
  { id: 'deepseek', name: 'DeepSeek', icon: 'D' },
  { id: 'venice', name: 'Venice AI', icon: 'V' },
];

export const AGENTS = [
  { id: 'architect', name: 'Architect', description: 'Designs narrative structure and plot' },
  { id: 'profiler', name: 'Profiler', description: 'Creates deep character profiles' },
  { id: 'strategist', name: 'Strategist', description: 'Plans scene-by-scene outlines' },
  { id: 'writer', name: 'Writer', description: 'Drafts scenes with sensory details' },
  { id: 'critic', name: 'Critic', description: 'Reviews and provides feedback' },
];

export const MODELS: Record<LLMProvider, LLMModel[]> = {
  openai: [
    // GPT-5 (Latest - December 2025)
    { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', contextWindow: 256000, inputPrice: 5, outputPrice: 20, capabilities: ['vision', 'function_calling', 'reasoning'], recommended: ['architect', 'strategist'] },
    { id: 'gpt-5', name: 'GPT-5', provider: 'openai', contextWindow: 256000, inputPrice: 4, outputPrice: 16, capabilities: ['vision', 'function_calling', 'reasoning'] },
    // GPT-4o Family
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, inputPrice: 2.5, outputPrice: 10, capabilities: ['vision', 'function_calling'], recommended: ['critic'] },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, inputPrice: 0.15, outputPrice: 0.6, capabilities: ['vision', 'function_calling'], recommended: ['writer'] },
    // O-series Reasoning
    { id: 'o3', name: 'O3', provider: 'openai', contextWindow: 200000, inputPrice: 10, outputPrice: 40, capabilities: ['reasoning'], recommended: ['strategist'] },
    { id: 'o3-mini', name: 'O3 Mini', provider: 'openai', contextWindow: 200000, inputPrice: 1.1, outputPrice: 4.4, capabilities: ['reasoning'] },
    { id: 'o1', name: 'O1', provider: 'openai', contextWindow: 200000, inputPrice: 15, outputPrice: 60, capabilities: ['reasoning'] },
  ],
  openrouter: [
    // Top Tier - Claude Opus 4.5 (S+ Prose)
    { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', provider: 'openrouter', contextWindow: 200000, inputPrice: 20, outputPrice: 100, capabilities: ['vision', 'prose'], recommended: ['architect', 'writer', 'critic'] },
    // Llama 4 Maverick (A+ Context - 256k)
    { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', provider: 'openrouter', contextWindow: 256000, inputPrice: 0.5, outputPrice: 1.5, capabilities: ['long_context'], recommended: ['profiler', 'strategist'] },
    // Claude 3.5 Sonnet
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter', contextWindow: 200000, inputPrice: 3, outputPrice: 15, capabilities: ['vision'], recommended: ['architect', 'critic'] },
    // Gemini 3 Pro (S+ Logic)
    { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', provider: 'openrouter', contextWindow: 2000000, inputPrice: 2.5, outputPrice: 10, capabilities: ['vision', 'reasoning'], recommended: ['strategist'] },
    // Gemini 2.0
    { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', provider: 'openrouter', contextWindow: 1000000, inputPrice: 0, outputPrice: 0, capabilities: ['vision', 'grounding'] },
    // Llama 3.3
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'openrouter', contextWindow: 131072, inputPrice: 0.12, outputPrice: 0.3, capabilities: [] },
    // DeepSeek
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'openrouter', contextWindow: 64000, inputPrice: 0.14, outputPrice: 0.28, capabilities: [] },
    // Qwen
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'openrouter', contextWindow: 131072, inputPrice: 0.35, outputPrice: 0.4, capabilities: [] },
  ],
  gemini: [
    // Gemini 3 (Latest - S+ Logic)
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'gemini', contextWindow: 2000000, inputPrice: 2.5, outputPrice: 10, capabilities: ['vision', 'reasoning'], recommended: ['architect', 'strategist'] },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'gemini', contextWindow: 1000000, inputPrice: 0.5, outputPrice: 2, capabilities: ['vision'], recommended: ['writer'] },
    // Gemini 2.0
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp', provider: 'gemini', contextWindow: 1000000, inputPrice: 0, outputPrice: 0, capabilities: ['vision', 'grounding', 'code_execution'] },
    { id: 'gemini-2.0-flash-thinking-exp', name: 'Gemini 2.0 Flash Thinking', provider: 'gemini', contextWindow: 1000000, inputPrice: 0, outputPrice: 0, capabilities: ['reasoning'], recommended: ['critic'] },
    // Gemini 1.5
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', contextWindow: 2000000, inputPrice: 1.25, outputPrice: 5, capabilities: ['vision'] },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', contextWindow: 1000000, inputPrice: 0.075, outputPrice: 0.3, capabilities: ['vision'] },
  ],
  anthropic: [
    // Claude Opus 4.5 (S+ Prose - Best for living prose)
    { id: 'claude-opus-4.5-20251201', name: 'Claude Opus 4.5', provider: 'anthropic', contextWindow: 200000, inputPrice: 20, outputPrice: 100, capabilities: ['vision', 'prose'], recommended: ['architect', 'writer', 'critic'] },
    // Claude 4 models
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextWindow: 200000, inputPrice: 3, outputPrice: 15, capabilities: ['vision', 'computer_use'], recommended: ['profiler'] },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, inputPrice: 15, outputPrice: 75, capabilities: ['vision', 'computer_use'], recommended: ['strategist'] },
    // Claude 3.5 models
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, inputPrice: 3, outputPrice: 15, capabilities: ['vision', 'computer_use'] },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, inputPrice: 0.8, outputPrice: 4, capabilities: ['vision'] },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', contextWindow: 64000, inputPrice: 0.14, outputPrice: 0.28, capabilities: ['function_calling'], recommended: ['writer', 'profiler'] },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', contextWindow: 64000, inputPrice: 0.55, outputPrice: 2.19, capabilities: ['reasoning'], recommended: ['architect', 'strategist', 'critic'] },
  ],
  venice: [
    // S+ Uncensored - Best for dialogues, roleplay, dark plots without censorship
    { id: 'dolphin-mistral-24b-venice', name: 'Dolphin Mistral 24B Venice Edition', provider: 'venice', contextWindow: 32000, inputPrice: 0.5, outputPrice: 1.5, capabilities: ['uncensored', 'roleplay'], recommended: ['writer', 'profiler'] },
    // Venice Large (Llama 4 Maverick)
    { id: 'llama-4-maverick-venice', name: 'Llama 4 Maverick (Venice Large)', provider: 'venice', contextWindow: 256000, inputPrice: 0.8, outputPrice: 2.4, capabilities: ['long_context', 'uncensored'], recommended: ['architect', 'strategist'] },
    // Other Venice models
    { id: 'llama-3.3-70b-venice', name: 'Llama 3.3 70B Venice', provider: 'venice', contextWindow: 131072, inputPrice: 0.3, outputPrice: 0.9, capabilities: ['uncensored'] },
    { id: 'mistral-large-venice', name: 'Mistral Large Venice', provider: 'venice', contextWindow: 128000, inputPrice: 0.4, outputPrice: 1.2, capabilities: ['uncensored'] },
  ],
};
