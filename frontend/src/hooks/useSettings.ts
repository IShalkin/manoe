import { useState, useEffect, useCallback } from 'react';
import { UserSettings, ProviderConfig, AgentConfig, LLMProvider, AGENTS, MODELS, LLMModel } from '../types';

const STORAGE_KEY = 'manoe_settings';
const MODELS_CACHE_KEY = 'manoe_models_cache';

interface DynamicModel {
  id: string;
  name: string;
  context_length?: number;
  description?: string;
}

interface ModelsCache {
  [provider: string]: {
    models: DynamicModel[];
    timestamp: number;
  };
}

const defaultAgentConfigs: AgentConfig[] = AGENTS.map(agent => ({
  agent: agent.id,
  provider: 'openai' as LLMProvider,
  model: 'gpt-4o',
}));

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>({
    providers: [],
    agents: defaultAgentConfigs,
  });
  const [loading, setLoading] = useState(true);
  const [dynamicModels, setDynamicModels] = useState<ModelsCache>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    setLoading(false);
  }, []);

  const saveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
  };

  const updateProvider = (provider: LLMProvider, apiKey: string) => {
    const existing = settings.providers.find(p => p.provider === provider);
    let newProviders: ProviderConfig[];
    
    if (existing) {
      newProviders = settings.providers.map(p => 
        p.provider === provider ? { ...p, apiKey, isValid: undefined } : p
      );
    } else {
      newProviders = [...settings.providers, { provider, apiKey }];
    }
    
    saveSettings({ ...settings, providers: newProviders });
  };

  const updateAgentConfig = (agentId: string, provider: LLMProvider, model: string) => {
    const newAgents = settings.agents.map(a =>
      a.agent === agentId ? { ...a, provider, model } : a
    );
    saveSettings({ ...settings, agents: newAgents });
  };

  const getProviderKey = (provider: LLMProvider): string | undefined => {
    return settings.providers.find(p => p.provider === provider)?.apiKey;
  };

  const getAgentConfig = (agentId: string): AgentConfig | undefined => {
    return settings.agents.find(a => a.agent === agentId);
  };

  const hasAnyApiKey = (): boolean => {
    return settings.providers.some(p => p.apiKey && p.apiKey.length > 0);
  };

  const getAvailableModels = (provider: LLMProvider): LLMModel[] => {
    // If we have dynamic models for this provider, use them
    const cached = dynamicModels[provider];
    if (cached && cached.models.length > 0) {
      return cached.models.map(m => ({
        id: m.id,
        name: m.name,
        provider,
        contextWindow: m.context_length || 128000,
        inputPrice: 0,
        outputPrice: 0,
        capabilities: [],
        description: m.description,
      }));
    }
    // Fall back to static models
    return MODELS[provider] || [];
  };

  const fetchModelsForProvider = useCallback(async (provider: LLMProvider): Promise<{ success: boolean; error?: string }> => {
    const apiKey = getProviderKey(provider);
    if (!apiKey) {
      return { success: false, error: 'No API key configured for this provider' };
    }

    setLoadingModels(prev => ({ ...prev, [provider]: true }));

    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });

      const data = await response.json();

      if (data.success && data.models) {
        const newCache = {
          ...dynamicModels,
          [provider]: {
            models: data.models,
            timestamp: Date.now(),
          },
        };
        setDynamicModels(newCache);
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(newCache));
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to fetch models' };
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  }, [dynamicModels, settings.providers]);

  const isLoadingModels = (provider: LLMProvider): boolean => {
    return loadingModels[provider] || false;
  };

  const hasDynamicModels = (provider: LLMProvider): boolean => {
    return !!dynamicModels[provider]?.models?.length;
  };

  return {
    settings,
    loading,
    updateProvider,
    updateAgentConfig,
    getProviderKey,
    getAgentConfig,
    hasAnyApiKey,
    getAvailableModels,
    fetchModelsForProvider,
    isLoadingModels,
    hasDynamicModels,
  };
}
