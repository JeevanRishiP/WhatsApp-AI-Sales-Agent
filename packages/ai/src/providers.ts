import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { type LanguageModel } from 'ai';

// ─── Types ────────────────────────────────────────────────────────

export type ModelTier = 'fast' | 'advanced';
export type ProviderName = 'google' | 'openai' | 'anthropic';

/** Resolved API keys (from env or per-tenant config) */
export interface ProviderKeys {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
}

/** A single model entry in the priority list */
export interface ModelEntry {
  provider: ProviderName;
  /** Exact model ID e.g. "gemini-1.5-flash", "gpt-4o-mini" */
  model: string;
  enabled: boolean;
}

/**
 * Per-tenant AI configuration stored in Tenant.aiConfig JSON column.
 * If absent, the global env defaults are used.
 */
export interface TenantAiConfig {
  /** Ordered priority list — first enabled entry is tried first */
  priorityList: ModelEntry[];
  /** Optional per-tenant API key overrides */
  keys?: ProviderKeys;
}

export interface ConfiguredModel {
  name: string;
  provider: ProviderName;
  model: LanguageModel;
}

// ─── Default model lists ───────────────────────────────────────────
// Gemini is primary; OpenAI is the fallback. Anthropic is optional.

export const DEFAULT_FAST_MODELS: ModelEntry[] = [
  { provider: 'google',    model: 'gemini-3.5-flash',        enabled: true },
  { provider: 'google',    model: 'gemini-3.5-flash-lite',   enabled: true },
  { provider: 'google',    model: 'gemini-3.8-flash',        enabled: true },
  { provider: 'openai',    model: 'gpt-4o-mini',             enabled: true },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', enabled: false },
];

export const DEFAULT_ADVANCED_MODELS: ModelEntry[] = [
  { provider: 'google',    model: 'gemini-3.5-flash',        enabled: true },
  { provider: 'google',    model: 'gemini-3.8-flash',        enabled: true },
  { provider: 'openai',    model: 'gpt-4o',                  enabled: true },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', enabled: false },
];

/** All models we support — used for UI picker in dashboard */
export const ALL_SUPPORTED_MODELS: Array<{
  provider: ProviderName;
  model: string;
  label: string;
  tier: ModelTier[];
}> = [
  // Google Gemini
  { provider: 'google', model: 'gemini-3.5-flash',        label: 'Gemini 3.5 Flash',         tier: ['fast', 'advanced'] },
  { provider: 'google', model: 'gemini-3.5-flash-lite',   label: 'Gemini 3.5 Flash Lite',    tier: ['fast'] },
  { provider: 'google', model: 'gemini-3.8-flash',        label: 'Gemini 3.8 Flash',         tier: ['fast', 'advanced'] },
  { provider: 'google', model: 'gemini-3.7-flash',        label: 'Gemini 3.7 Flash',         tier: ['fast', 'advanced'] },
  // OpenAI
  { provider: 'openai', model: 'gpt-4o-mini',             label: 'GPT-4o Mini',              tier: ['fast'] },
  { provider: 'openai', model: 'gpt-4o',                  label: 'GPT-4o',                   tier: ['advanced'] },
  { provider: 'openai', model: 'gpt-4-turbo',             label: 'GPT-4 Turbo',              tier: ['advanced'] },
  // Anthropic
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku',   tier: ['fast'] },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet',  tier: ['advanced'] },
];

// ─── ModelFactory ─────────────────────────────────────────────────

export class ModelFactory {
  private openai: ReturnType<typeof createOpenAI> | null;
  private anthropic: ReturnType<typeof createAnthropic> | null;
  private google: ReturnType<typeof createGoogleGenerativeAI> | null;

  constructor(keys?: ProviderKeys) {
    const openaiKey   = keys?.openaiApiKey   || process.env['OPENAI_API_KEY'];
    const anthropicKey = keys?.anthropicApiKey || process.env['ANTHROPIC_API_KEY'];
    const googleKey   =
      keys?.googleApiKey ||
      process.env['GEMINI_API_KEY'] ||
      process.env['GOOGLE_GENERATIVE_AI_API_KEY'];

    this.openai   = openaiKey    ? createOpenAI({ apiKey: openaiKey })               : null;
    this.anthropic = anthropicKey ? createAnthropic({ apiKey: anthropicKey })        : null;
    this.google   = googleKey    ? createGoogleGenerativeAI({ apiKey: googleKey })   : null;
  }

  /**
   * Returns models in priority order for automatic fallback.
   *
   * Priority resolution:
   *   1. Use tenant's custom priorityList (from Tenant.aiConfig in DB) if provided
   *   2. Fall back to env-based defaults (Gemini → OpenAI)
   */
  getFallbackChain(tier: ModelTier = 'fast', tenantConfig?: TenantAiConfig): ConfiguredModel[] {
    const chain: ConfiguredModel[] = [];

    // 1. Build the ordered list to use
    const priorityList: ModelEntry[] =
      tenantConfig?.priorityList?.length
        ? tenantConfig.priorityList
        : (tier === 'fast' ? DEFAULT_FAST_MODELS : DEFAULT_ADVANCED_MODELS);

    // 2. Walk priority list in order, skip disabled or unavailable providers
    for (const entry of priorityList) {
      if (!entry.enabled) continue;

      const resolved = this.resolveModel(entry.provider, entry.model);
      if (resolved) {
        chain.push({
          name: entry.model,
          provider: entry.provider,
          model: resolved,
        });
      }
    }

    if (chain.length === 0) {
      throw new Error(
        'No AI models available! Add a GEMINI_API_KEY or OPENAI_API_KEY to your .env file, ' +
        'or configure AI models in the dashboard → Settings → AI Models.'
      );
    }

    return chain;
  }

  /** Resolves a provider + model ID to an AI SDK LanguageModel instance */
  private resolveModel(provider: ProviderName, model: string): LanguageModel | null {
    switch (provider) {
      case 'google':
        return this.google ? this.google(model) : null;
      case 'openai':
        return this.openai ? this.openai(model) : null;
      case 'anthropic':
        return this.anthropic ? this.anthropic(model) : null;
      default:
        return null;
    }
  }
}
