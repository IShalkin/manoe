import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  model: '',
}));

interface SettingsContextType {
  settings: UserSettings;
  loading: boolean;
  updateProvider: (provider: LLMProvider, apiKey: string) => void;
  updateAgentConfig: (agentId: string, provider: LLMProvider, model: string) => void;
  getProviderKey: (provider: LLMProvider) => string | undefined;
  getAgentConfig: (agentId: string) => AgentConfig | undefined;
  hasAnyApiKey: () => boolean;
  getAvailableModels: (provider: LLMProvider) => LLMModel[];
  fetchModelsForProvider: (provider: LLMProvider) => Promise<{ success: boolean; error?: string }>;
  isLoadingModels: (provider: LLMProvider) => boolean;
  hasDynamicModels: (provider: LLMProvider) => boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>({
    providers: [],
    agents: defaultAgentConfigs,
  });
  const [loading, setLoading] = useState(true);
  const [dynamicModels, setDynamicModels] = useState<ModelsCache>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log('[SettingsContext] Loading settings from localStorage:', stored ? 'found' : 'empty');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
        console.log('[SettingsContext] Loaded providers:', parsed.providers?.length || 0);
      } catch (e) {
        console.error('[SettingsContext] Failed to parse settings:', e);
      }
    }
    
    // Load models cache
    const cachedModels = localStorage.getItem(MODELS_CACHE_KEY);
    if (cachedModels) {
      try {
        setDynamicModels(JSON.parse(cachedModels));
      } catch (e) {
        console.error('[SettingsContext] Failed to parse models cache:', e);
      }
    }
    
    setLoading(false);
  }, []);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      console.log('[SettingsContext] Saved settings to localStorage');
    }
  }, [settings, loading]);

  const updateProvider = useCallback((provider: LLMProvider, apiKey: string) => {
    setSettings(prev => {
      const existing = prev.providers.find(p => p.provider === provider);
      let newProviders: ProviderConfig[];
      
      if (existing) {
        newProviders = prev.providers.map(p => 
          p.provider === provider ? { ...p, apiKey, isValid: undefined } : p
        );
      } else {
        newProviders = [...prev.providers, { provider, apiKey }];
      }
      
      console.log('[SettingsContext] Updated provider:', provider, 'key length:', apiKey.length);
      return { ...prev, providers: newProviders };
    });
  }, []);

  const updateAgentConfig = useCallback((agentId: string, provider: LLMProvider, model: string) => {
    setSettings(prev => {
      const newAgents = prev.agents.map(a =>
        a.agent === agentId ? { ...a, provider, model } : a
      );
      return { ...prev, agents: newAgents };
    });
  }, []);

  const getProviderKey = useCallback((provider: LLMProvider): string | undefined => {
    return settings.providers.find(p => p.provider === provider)?.apiKey;
  }, [settings.providers]);

  const getAgentConfig = useCallback((agentId: string): AgentConfig | undefined => {
    return settings.agents.find(a => a.agent === agentId);
  }, [settings.agents]);

  const hasAnyApiKey = useCallback((): boolean => {
    return settings.providers.some(p => p.apiKey && p.apiKey.length > 0);
  }, [settings.providers]);

  const getAvailableModels = useCallback((provider: LLMProvider): LLMModel[] => {
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
  }, [dynamicModels]);

  const fetchModelsForProvider = useCallback(async (provider: LLMProvider): Promise<{ success: boolean; error?: string }> => {
    const apiKey = settings.providers.find(p => p.provider === provider)?.apiKey;
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

  const isLoadingModels = useCallback((provider: LLMProvider): boolean => {
    return loadingModels[provider] || false;
  }, [loadingModels]);

  const hasDynamicModels = useCallback((provider: LLMProvider): boolean => {
    return !!dynamicModels[provider]?.models?.length;
  }, [dynamicModels]);

  return (
    <SettingsContext.Provider value={{
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
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
