import * as vscode from 'vscode';

export const providerVendor = 'kie';
export const legacyApiKeySecretKey = 'kieChatProvider.apiKey';
export const manageCredentialsCommand = 'kieChatProvider.manageCredentials';
export const clearApiKeyCommand = 'kieChatProvider.clearApiKey';

export type KieReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type KieModelProtocol = 'openai-chat' | 'openai-responses' | 'claude' | 'gemini';

export interface KieConfiguredModelInput {
  id?: unknown;
  displayName?: unknown;
  endpoint?: unknown;
  protocol?: unknown;
  requestModel?: unknown;
  family?: unknown;
  vendorVersion?: unknown;
  tooltip?: unknown;
  detail?: unknown;
  maxInputTokens?: unknown;
  maxOutputTokens?: unknown;
  enableVision?: unknown;
  enableTools?: unknown;
  stream?: unknown;
  sendModelInBody?: unknown;
  apiKeySecretKey?: unknown;
  authHeader?: unknown;
  authScheme?: unknown;
  extraHeaders?: unknown;
  extraBody?: unknown;
}

export interface KieProviderModel {
  id: string;
  displayName: string;
  endpoint: string;
  protocol: KieModelProtocol;
  requestModel: string;
  family: string;
  vendorVersion: string;
  tooltip: string;
  detail: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  enableVision: boolean;
  enableTools: boolean;
  stream: boolean;
  sendModelInBody: boolean;
  apiKeySecretKey: string;
  authHeader: string;
  authScheme: string;
  extraHeaders: Record<string, string>;
  extraBody: Record<string, unknown>;
}

export interface KieSecretTarget {
  secretKey: string;
  label: string;
  description: string;
  detail: string;
  modelCount: number;
}

const BUILT_IN_KIE_MODELS: ReadonlyArray<Omit<KieProviderModel, 'apiKeySecretKey'>> = [
  {
    id: 'gpt-5-2',
    displayName: 'GPT 5.2 (KIE)',
    endpoint: 'https://api.kie.ai/gpt-5-2/v1/chat/completions',
    protocol: 'openai-chat',
    requestModel: 'gpt-5-2',
    family: 'gpt',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in GPT 5.2 chat/completions endpoint',
    detail: 'KIE built-in · chat/completions',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      reasoning_effort: 'high',
    },
  },
  {
    id: 'gpt-5-4',
    displayName: 'GPT 5.4 (KIE)',
    endpoint: 'https://api.kie.ai/codex/v1/responses',
    protocol: 'openai-responses',
    requestModel: 'gpt-5-4',
    family: 'gpt',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in GPT 5.4 responses endpoint',
    detail: 'KIE built-in · responses',
    maxInputTokens: 262144,
    maxOutputTokens: 16384,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      reasoning: {
        effort: 'high',
      },
    },
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5 (KIE)',
    endpoint: 'https://api.kie.ai/claude/v1/messages',
    protocol: 'claude',
    requestModel: 'claude-haiku-4-5',
    family: 'claude',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Claude Haiku 4.5 messages endpoint',
    detail: 'KIE built-in · claude/messages',
    maxInputTokens: 160000,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
    },
    extraBody: {
      cache_control: {
        type: 'ephemeral',
      },
      thinkingFlag: true,
    },
  },
  {
    id: 'claude-opus-4-5',
    displayName: 'Claude Opus 4.5 (KIE)',
    endpoint: 'https://api.kie.ai/claude/v1/messages',
    protocol: 'claude',
    requestModel: 'claude-opus-4-5',
    family: 'claude',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Claude Opus 4.5 messages endpoint',
    detail: 'KIE built-in · claude/messages',
    maxInputTokens: 160000,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
    },
    extraBody: {
      cache_control: {
        type: 'ephemeral',
      },
      thinkingFlag: true,
    },
  },
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6 (KIE)',
    endpoint: 'https://api.kie.ai/claude/v1/messages',
    protocol: 'claude',
    requestModel: 'claude-opus-4-6',
    family: 'claude',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Claude Opus 4.6 messages endpoint',
    detail: 'KIE built-in · claude/messages',
    maxInputTokens: 160000,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
    },
    extraBody: {
      cache_control: {
        type: 'ephemeral',
      },
      thinkingFlag: true,
    },
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5 (KIE)',
    endpoint: 'https://api.kie.ai/claude/v1/messages',
    protocol: 'claude',
    requestModel: 'claude-sonnet-4-5',
    family: 'claude',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Claude Sonnet 4.5 messages endpoint',
    detail: 'KIE built-in · claude/messages',
    maxInputTokens: 160000,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
    },
    extraBody: {
      cache_control: {
        type: 'ephemeral',
      },
      thinkingFlag: true,
    },
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6 (KIE)',
    endpoint: 'https://api.kie.ai/claude/v1/messages',
    protocol: 'claude',
    requestModel: 'claude-sonnet-4-6',
    family: 'claude',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Claude Sonnet 4.6 messages endpoint',
    detail: 'KIE built-in · claude/messages',
    maxInputTokens: 160000,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
    },
    extraBody: {
      cache_control: {
        type: 'ephemeral',
      },
      thinkingFlag: true,
    },
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro (KIE)',
    endpoint: 'https://api.kie.ai/gemini-2.5-pro/v1/chat/completions',
    protocol: 'openai-chat',
    requestModel: 'gemini-2.5-pro',
    family: 'gemini',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Gemini 2.5 Pro OpenAI-compatible endpoint',
    detail: 'KIE built-in · chat/completions',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      include_thoughts: true,
      reasoning_effort: 'high',
    },
  },
  {
    id: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro (KIE)',
    endpoint: 'https://api.kie.ai/gemini-3-pro/v1/chat/completions',
    protocol: 'openai-chat',
    requestModel: 'gemini-3-pro',
    family: 'gemini',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Gemini 3 Pro OpenAI-compatible endpoint',
    detail: 'KIE built-in · chat/completions',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      include_thoughts: true,
      reasoning_effort: 'high',
    },
  },
  {
    id: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro (KIE)',
    endpoint: 'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions',
    protocol: 'openai-chat',
    requestModel: 'gemini-3.1-pro',
    family: 'gemini',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Gemini 3.1 Pro OpenAI-compatible endpoint',
    detail: 'KIE built-in · chat/completions',
    maxInputTokens: 139000,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      include_thoughts: true,
      reasoning_effort: 'high',
    },
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash (KIE)',
    endpoint: 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions',
    protocol: 'openai-chat',
    requestModel: 'gemini-2.5-flash',
    family: 'gemini',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Gemini 2.5 Flash OpenAI-compatible endpoint',
    detail: 'KIE built-in · chat/completions',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      include_thoughts: true,
      reasoning_effort: 'high',
    },
  },
  {
    id: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash (OpenAI, KIE)',
    endpoint: 'https://api.kie.ai/gemini-3-flash/v1/chat/completions',
    protocol: 'openai-chat',
    requestModel: 'gemini-3-flash',
    family: 'gemini',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Gemini 3 Flash OpenAI-compatible endpoint',
    detail: 'KIE built-in · chat/completions',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      include_thoughts: true,
      reasoning_effort: 'high',
    },
  },
  {
    id: 'gemini-3-flash-v1betamodels',
    displayName: 'Gemini 3 Flash (Native, KIE)',
    endpoint: 'https://api.kie.ai/gemini/v1/models/gemini-3-flash-v1betamodels:streamGenerateContent',
    protocol: 'gemini',
    requestModel: 'gemini-3-flash-v1betamodels',
    family: 'gemini',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in Gemini 3 Flash native Gemini endpoint',
    detail: 'KIE built-in · gemini native',
    maxInputTokens: 131072,
    maxOutputTokens: 8192,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: false,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      generationConfig: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: 'high',
        },
      },
    },
  },
  {
    id: 'gpt-5-codex',
    displayName: 'GPT 5 Codex (KIE)',
    endpoint: 'https://api.kie.ai/api/v1/responses',
    protocol: 'openai-responses',
    requestModel: 'gpt-5-codex',
    family: 'codex',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in GPT 5 Codex responses endpoint',
    detail: 'KIE built-in · responses',
    maxInputTokens: 262144,
    maxOutputTokens: 16384,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      reasoning: {
        effort: 'high',
      },
    },
  },
  {
    id: 'gpt-5.1-codex',
    displayName: 'GPT 5.1 Codex (KIE)',
    endpoint: 'https://api.kie.ai/api/v1/responses',
    protocol: 'openai-responses',
    requestModel: 'gpt-5.1-codex',
    family: 'codex',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in GPT 5.1 Codex responses endpoint',
    detail: 'KIE built-in · responses',
    maxInputTokens: 262144,
    maxOutputTokens: 16384,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      reasoning: {
        effort: 'high',
      },
    },
  },
  {
    id: 'gpt-5.2-codex',
    displayName: 'GPT 5.2 Codex (KIE)',
    endpoint: 'https://api.kie.ai/api/v1/responses',
    protocol: 'openai-responses',
    requestModel: 'gpt-5.2-codex',
    family: 'codex',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in GPT 5.2 Codex responses endpoint',
    detail: 'KIE built-in · responses',
    maxInputTokens: 262144,
    maxOutputTokens: 16384,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      reasoning: {
        effort: 'high',
      },
    },
  },
  {
    id: 'gpt-5.3-codex',
    displayName: 'GPT 5.3 Codex (KIE)',
    endpoint: 'https://api.kie.ai/api/v1/responses',
    protocol: 'openai-responses',
    requestModel: 'gpt-5.3-codex',
    family: 'codex',
    vendorVersion: '1.0.0',
    tooltip: 'KIE built-in GPT 5.3 Codex responses endpoint',
    detail: 'KIE built-in · responses',
    maxInputTokens: 262144,
    maxOutputTokens: 16384,
    enableVision: true,
    enableTools: true,
    stream: true,
    sendModelInBody: true,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders: {},
    extraBody: {
      reasoning: {
        effort: 'high',
      },
    },
  },
];

export function getEffectiveModelConfigs(): KieProviderModel[] {
  const configuration = vscode.workspace.getConfiguration();
  const builtInModels = getBuiltInKieModels(configuration);
  const configuredModels =
    configuration.get<KieConfiguredModelInput[]>('kieChatProvider.models', []) ?? [];

  const customModels = configuredModels
    .map((model) => normalizeConfiguredModel(model, configuration))
    .filter((model): model is KieProviderModel => Boolean(model));

  if (builtInModels.length === 0 && customModels.length === 0) {
    return [getLegacySingleModelConfig(configuration)];
  }

  return mergeModels([...builtInModels, ...customModels]);
}

export function getSecretTargets(models: readonly KieProviderModel[]): KieSecretTarget[] {
  const grouped = new Map<string, { modelNames: string[]; ids: string[] }>();

  for (const model of models) {
    const entry = grouped.get(model.apiKeySecretKey) ?? { modelNames: [], ids: [] };
    entry.modelNames.push(model.displayName);
    entry.ids.push(model.id);
    grouped.set(model.apiKeySecretKey, entry);
  }

  return Array.from(grouped.entries()).map(([secretKey, group]) => ({
    secretKey,
    label:
      group.modelNames.length === 1
        ? group.modelNames[0]
        : `Shared credential (${group.modelNames.length} models)`,
    description: secretKey,
    detail: group.modelNames.join(', '),
    modelCount: group.modelNames.length,
  }));
}

function getBuiltInKieModels(
  configuration: vscode.WorkspaceConfiguration
): KieProviderModel[] {
  const includeBuiltIns = normalizeBoolean(
    configuration.get<boolean>('kieChatProvider.includeBuiltInKieModels', true),
    true
  );
  if (!includeBuiltIns) {
    return [];
  }

  const disabledModelIds = new Set(
    (
      configuration.get<string[]>('kieChatProvider.disabledBuiltInModelIds', []) ?? []
    )
      .map((item) => normalizeString(item))
      .filter(Boolean)
  );
  const defaultSecretKey = getDefaultSecretKey(configuration);

  return BUILT_IN_KIE_MODELS.filter((model) => !disabledModelIds.has(model.id)).map((model) => ({
    ...model,
    apiKeySecretKey: defaultSecretKey,
  }));
}

function getLegacySingleModelConfig(
  configuration: vscode.WorkspaceConfiguration
): KieProviderModel {
  const modelId = normalizeString(
    configuration.get<string>('kieChatProvider.modelId', 'gemini-3.1-pro')
  );
  const endpoint = normalizeString(
    configuration.get<string>(
      'kieChatProvider.endpoint',
      'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions'
    )
  );
  const displayName = normalizeString(
    configuration.get<string>('kieChatProvider.displayName', 'Gemini 3.1 Pro (KIE)')
  );
  const family = normalizeString(configuration.get<string>('kieChatProvider.family', 'gemini'));
  const vendorVersion = normalizeString(
    configuration.get<string>('kieChatProvider.vendorVersion', '1.0.0')
  );
  const maxInputTokens = normalizeNumber(
    configuration.get<number>('kieChatProvider.maxInputTokens', 131072),
    131072
  );
  const maxOutputTokens = normalizeNumber(
    configuration.get<number>('kieChatProvider.maxOutputTokens', 8192),
    8192
  );
  const enableVision = normalizeBoolean(
    configuration.get<boolean>('kieChatProvider.enableVision', true),
    true
  );
  const enableTools = normalizeBoolean(
    configuration.get<boolean>('kieChatProvider.enableTools', true),
    true
  );
  const sendModelInBody = normalizeBoolean(
    configuration.get<boolean>('kieChatProvider.sendModelInBody', false),
    false
  );
  const includeThoughts = normalizeBoolean(
    configuration.get<boolean>('kieChatProvider.includeThoughts', true),
    true
  );
  const reasoningEffort = normalizeReasoningEffort(
    configuration.get<KieReasoningEffort>('kieChatProvider.reasoningEffort', 'high')
  );
  const extraHeaders = normalizeRecord(
    configuration.get<Record<string, string>>('kieChatProvider.extraHeaders', {})
  );
  const defaultSecretKey = getDefaultSecretKey(configuration);

  const extraBody: Record<string, unknown> = {};
  if (includeThoughts) {
    extraBody.include_thoughts = true;
  }
  if (reasoningEffort !== 'none') {
    extraBody.reasoning_effort = reasoningEffort;
  }

  return {
    id: modelId,
    displayName,
    endpoint,
    protocol: 'openai-chat',
    requestModel: modelId,
    family,
    vendorVersion,
    tooltip: endpoint,
    detail: endpoint,
    maxInputTokens,
    maxOutputTokens,
    enableVision,
    enableTools,
    stream: true,
    sendModelInBody,
    apiKeySecretKey: defaultSecretKey,
    authHeader: 'Authorization',
    authScheme: 'Bearer',
    extraHeaders,
    extraBody,
  };
}

function normalizeConfiguredModel(
  input: KieConfiguredModelInput,
  configuration: vscode.WorkspaceConfiguration
): KieProviderModel | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const id = normalizeString(input.id);
  const displayName = normalizeString(input.displayName);
  const endpoint = normalizeString(input.endpoint);
  if (!id || !displayName || !endpoint) {
    return null;
  }

  const defaultSecretKey = getDefaultSecretKey(configuration);
  const requestModel = normalizeString(input.requestModel) || id;
  const detail = normalizeString(input.detail) || endpoint;
  const tooltip = normalizeString(input.tooltip) || endpoint;

  return {
    id,
    displayName,
    endpoint,
    protocol: normalizeProtocol(input.protocol),
    requestModel,
    family: normalizeString(input.family) || 'openai-compatible',
    vendorVersion: normalizeString(input.vendorVersion) || '1.0.0',
    tooltip,
    detail,
    maxInputTokens: normalizeNumber(input.maxInputTokens, 131072),
    maxOutputTokens: normalizeNumber(input.maxOutputTokens, 8192),
    enableVision: normalizeBoolean(input.enableVision, true),
    enableTools: normalizeBoolean(input.enableTools, true),
    stream: normalizeBoolean(input.stream, true),
    sendModelInBody: normalizeBoolean(input.sendModelInBody, false),
    apiKeySecretKey: normalizeString(input.apiKeySecretKey) || defaultSecretKey,
    authHeader: normalizeString(input.authHeader) || 'Authorization',
    authScheme:
      input.authScheme === '' ? '' : normalizeString(input.authScheme) || 'Bearer',
    extraHeaders: normalizeRecord(input.extraHeaders),
    extraBody: normalizeLooseObject(input.extraBody),
  };
}

function getDefaultSecretKey(configuration: vscode.WorkspaceConfiguration): string {
  return normalizeString(
    configuration.get<string>('kieChatProvider.defaultApiKeySecretKey', legacyApiKeySecretKey)
  );
}

function mergeModels(models: readonly KieProviderModel[]): KieProviderModel[] {
  const merged = new Map<string, KieProviderModel>();
  for (const model of models) {
    merged.set(model.id, model);
  }
  return Array.from(merged.values());
}

function normalizeRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entryValue]) => key.trim().length > 0 && typeof entryValue === 'string'
    )
  );
}

function normalizeLooseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeProtocol(value: unknown): KieModelProtocol {
  switch (value) {
    case 'openai-responses':
    case 'claude':
    case 'gemini':
    case 'openai-chat':
      return value;
    default:
      return 'openai-chat';
  }
}

function normalizeReasoningEffort(value: unknown): KieReasoningEffort {
  switch (value) {
    case 'none':
    case 'low':
    case 'medium':
    case 'high':
      return value;
    default:
      return 'high';
  }
}
