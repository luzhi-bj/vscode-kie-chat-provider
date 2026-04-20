import * as vscode from 'vscode';
import {
  getEffectiveModelConfigs,
  getSecretTargets,
  KieModelProtocol,
  KieProviderModel,
  KieSecretTarget,
} from './settings';

type OpenAIContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OpenAIRequestTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};

type ResponsesInputPart =
  | {
      type: 'input_text';
      text: string;
    }
  | {
      type: 'input_image';
      image_url: string;
    }
  | {
      type: 'input_file';
      file_url: string;
    }
  | {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'function_call_output';
      call_id: string;
      output: string;
    };

type ResponsesInputMessage = {
  role: 'system' | 'user' | 'assistant';
  content: ResponsesInputPart[];
};

type ClaudeContentPart =
  | {
      type: 'text';
      text: string;
      cache_control?: ClaudeCacheControl;
    }
  | {
      type: 'image';
      source: {
        type: 'url';
        url: string;
      };
      cache_control?: ClaudeCacheControl;
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: object;
      cache_control?: ClaudeCacheControl;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      cache_control?: ClaudeCacheControl;
    };

type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: ClaudeContentPart[];
};

type ClaudeCacheControl = {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
};

type ClaudeTool = {
  name: string;
  description?: string;
  input_schema?: unknown;
  cache_control?: ClaudeCacheControl;
};

type ClaudeSystemBlock = {
  type: 'text';
  text: string;
  cache_control?: ClaudeCacheControl;
};

type GeminiPart =
  | { text: string }
  | { file_data: { mime_type: string; file_uri: string } }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: object } }
  | { functionResponse: { name: string; response: object } };

type GeminiMessage = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

type ToolCallRecord = {
  callId: string;
  name: string;
  input: object;
};

type OpenAIChatResponse = {
  error?: {
    message?: string;
  };
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      tool_calls?: OpenAIToolCall[];
    };
    delta?: {
      content?: string | Array<{ type?: string; text?: string }>;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
};

type ResponsesApiResponse = {
  error?: {
    message?: string;
  };
  output?: Array<{
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  response?: {
    output?: Array<{
      type?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };
};

type ClaudeResponse = {
  error?: {
    message?: string;
  };
  content?: Array<{
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    input?: object;
  }>;
  response?: {
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: object;
    }>;
  };
};

type GeminiResponse = {
  error?: {
    message?: string;
  };
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        functionCall?: {
          id?: string;
          name?: string;
          args?: object;
        };
      }>;
    };
  }>;
  response?: {
    candidates?: Array<{
      finishReason?: string;
      content?: {
        parts?: Array<{
          text?: string;
          thought?: boolean;
          functionCall?: {
            id?: string;
            name?: string;
            args?: object;
          };
        }>;
      };
    }>;
  };
};

export class KieChatModelProvider
  implements vscode.LanguageModelChatProvider, vscode.Disposable
{
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;
  private readonly configurationWatcher: vscode.Disposable;
  private readonly toolNameByCallId = new Map<string, string>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.configurationWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('kieChatProvider')) {
        this.onDidChangeEmitter.fire();
      }
    });
  }

  dispose(): void {
    this.configurationWatcher.dispose();
    this.onDidChangeEmitter.dispose();
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    if (token.isCancellationRequested) {
      return [];
    }

    let models = getEffectiveModelConfigs();
    let availableModels = await this.getModelsWithCredentials(models);

    if (availableModels.length === 0 && !options.silent) {
      const configured = await this.promptForApiKey();
      if (configured) {
        models = getEffectiveModelConfigs();
        availableModels = await this.getModelsWithCredentials(models);
      }
    }

    return availableModels.map((model) => this.toChatInformation(model));
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const modelConfig = this.getModelConfig(model.id);
    const apiKey = await this.getApiKeyOrThrow(modelConfig);
    const body = this.buildRequestBody(modelConfig, messages, options);
    const abortController = new AbortController();
    const cancellationSubscription = token.onCancellationRequested(() => abortController.abort());

    try {
      const response = await fetch(modelConfig.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(apiKey, modelConfig),
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(await this.getErrorMessage(response));
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (modelConfig.stream && contentType.includes('text/event-stream')) {
        await this.consumeStreamingResponse(modelConfig.protocol, response, progress, token);
        return;
      }

      const payload = await response.json();
      this.reportNonStreamingResponse(modelConfig.protocol, payload, progress);
    } finally {
      cancellationSubscription.dispose();
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const rawText =
      typeof text === 'string'
        ? text
        : text.content
            .map((part) => {
              if (part instanceof vscode.LanguageModelTextPart) {
                return part.value;
              }

              return JSON.stringify(part);
            })
            .join('\n');

    return Math.max(1, Math.ceil(rawText.length / 4));
  }

  async promptForApiKey(secretKey?: string): Promise<boolean> {
    const target = await this.pickSecretTarget(secretKey);
    if (!target) {
      return false;
    }

    const existingValue = await this.context.secrets.get(target.secretKey);
    const apiKey = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      password: true,
      prompt:
        target.modelCount === 1
          ? `Enter the credential for ${target.label}.`
          : `Enter the shared credential for ${target.modelCount} models.`,
      placeHolder: 'sk-...',
      value: existingValue ?? '',
      validateInput: (value) =>
        value.trim().length === 0 ? 'A credential value is required before the model can be used.' : null,
    });

    if (!apiKey) {
      return false;
    }

    await this.context.secrets.store(target.secretKey, apiKey.trim());
    this.onDidChangeEmitter.fire();
    void vscode.window.showInformationMessage(`Saved credential for ${target.label}.`);
    return true;
  }

  async clearApiKey(secretKey?: string): Promise<void> {
    const target = await this.pickSecretTarget(secretKey, 'Select which credential to clear.');
    if (!target) {
      return;
    }

    await this.context.secrets.delete(target.secretKey);
    this.onDidChangeEmitter.fire();
    void vscode.window.showInformationMessage(`Cleared credential for ${target.label}.`);
  }

  private async pickSecretTarget(
    secretKey?: string,
    placeHolder = 'Select which credential to configure.'
  ): Promise<KieSecretTarget | undefined> {
    const targets = getSecretTargets(getEffectiveModelConfigs());
    if (targets.length === 0) {
      return undefined;
    }

    if (secretKey) {
      return targets.find((target) => target.secretKey === secretKey);
    }

    if (targets.length === 1) {
      return targets[0];
    }

    return vscode.window
      .showQuickPick(
        targets.map((target) => ({
          label: target.label,
          description: target.description,
          detail: target.detail,
          target,
        })),
        {
          placeHolder,
          ignoreFocusOut: true,
        }
      )
      .then((item) => item?.target);
  }

  private async getModelsWithCredentials(
    models: readonly KieProviderModel[]
  ): Promise<KieProviderModel[]> {
    const availableModels: KieProviderModel[] = [];

    for (const model of models) {
      const apiKey = await this.context.secrets.get(model.apiKeySecretKey);
      if (apiKey) {
        availableModels.push(model);
      }
    }

    return availableModels;
  }

  private getModelConfig(modelId: string): KieProviderModel {
    const modelConfig = getEffectiveModelConfigs().find((entry) => entry.id === modelId);
    if (!modelConfig) {
      throw new Error(`Model "${modelId}" is no longer configured in kieChatProvider.`);
    }

    return modelConfig;
  }

  private async getApiKeyOrThrow(modelConfig: KieProviderModel): Promise<string> {
    const apiKey = await this.context.secrets.get(modelConfig.apiKeySecretKey);
    if (!apiKey) {
      throw new Error(
        `Missing credential for ${modelConfig.displayName}. Run "KIE Chat Provider: Configure Credential" first.`
      );
    }

    return apiKey;
  }

  private toChatInformation(model: KieProviderModel): vscode.LanguageModelChatInformation {
    return {
      id: model.id,
      name: model.displayName,
      family: model.family,
      version: model.vendorVersion,
      maxInputTokens: model.maxInputTokens,
      maxOutputTokens: model.maxOutputTokens,
      tooltip: model.tooltip,
      detail: model.detail,
      capabilities: {
        imageInput: model.enableVision,
        toolCalling: model.enableTools,
      },
    };
  }

  private buildHeaders(apiKey: string, modelConfig: KieProviderModel): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...modelConfig.extraHeaders,
    };

    if (modelConfig.authHeader) {
      headers[modelConfig.authHeader] = modelConfig.authScheme
        ? `${modelConfig.authScheme} ${apiKey}`
        : apiKey;
    }

    return headers;
  }

  private buildRequestBody(
    modelConfig: KieProviderModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): Record<string, unknown> {
    switch (modelConfig.protocol) {
      case 'openai-responses':
        return this.buildResponsesRequest(modelConfig, messages, options);
      case 'claude':
        return this.buildClaudeRequest(modelConfig, messages, options);
      case 'gemini':
        return this.buildGeminiRequest(modelConfig, messages, options);
      case 'openai-chat':
      default:
        return this.buildOpenAIChatRequest(modelConfig, messages, options);
    }
  }

  private buildOpenAIChatRequest(
    modelConfig: KieProviderModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      ...modelConfig.extraBody,
      messages: this.convertMessagesToOpenAIChat(messages),
    };

    if (modelConfig.stream) {
      body.stream = true;
    }

    if (modelConfig.sendModelInBody) {
      body.model = modelConfig.requestModel;
    }

    const tools = this.convertToolsToOpenAI(options, modelConfig);
    if (tools.length > 0) {
      body.tools = tools;
      if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
        body.tool_choice = 'required';
      }
    }

    return body;
  }

  private buildResponsesRequest(
    modelConfig: KieProviderModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      ...modelConfig.extraBody,
      model: modelConfig.requestModel,
      input: this.convertMessagesToResponses(messages),
    };

    if (modelConfig.stream) {
      body.stream = true;
    }

    const tools = this.convertToolsToResponses(options, modelConfig);
    if (tools.length > 0) {
      body.tools = tools;
      if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
        body.tool_choice = 'required';
      }
    }

    return body;
  }

  private buildClaudeRequest(
    modelConfig: KieProviderModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): Record<string, unknown> {
    const { system, messages: claudeMessages } = this.convertMessagesToClaude(messages);
    const extraBody = this.normalizeLooseObject(modelConfig.extraBody);
    const cacheControl = this.readClaudeTopLevelCacheControl(extraBody.cache_control);
    delete extraBody.cache_control;

    const body: Record<string, unknown> = {
      ...extraBody,
      model: modelConfig.requestModel,
      messages: claudeMessages,
    };

    if (modelConfig.stream) {
      body.stream = true;
    }

    const tools = this.convertToolsToClaude(options, modelConfig);
    if (tools.length > 0) {
      body.tools = tools;
    }

    if (system) {
      body.system = system;
    }

    if (cacheControl) {
      this.applyAutomaticClaudeCacheControl(body, cacheControl);
    }

    return body;
  }

  private buildGeminiRequest(
    modelConfig: KieProviderModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): Record<string, unknown> {
    const { system, contents } = this.convertMessagesToGemini(messages);
    const body: Record<string, unknown> = {
      ...modelConfig.extraBody,
      contents,
    };

    if (system) {
      body.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    if (modelConfig.stream) {
      body.stream = true;
    }

    const tools = this.convertToolsToGemini(options, modelConfig);
    if (tools.length > 0) {
      body.tools = tools;
    }

    return body;
  }

  private convertMessagesToOpenAIChat(
    messages: readonly vscode.LanguageModelChatRequestMessage[]
  ): OpenAIMessage[] {
    const converted: OpenAIMessage[] = [];

    for (const message of messages) {
      const role = this.getOpenAiRole(message.role);
      const textParts: OpenAIContentPart[] = [];
      const assistantToolCalls: OpenAIToolCall[] = [];

      for (const part of message.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          textParts.push({ type: 'text', text: part.value });
          continue;
        }

        if (part instanceof vscode.LanguageModelToolCallPart) {
          assistantToolCalls.push({
            id: part.callId,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input ?? {}),
            },
          });
          this.rememberToolCall(part.callId, part.name);
          continue;
        }

        if (part instanceof vscode.LanguageModelToolResultPart) {
          converted.push({
            role: 'tool',
            tool_call_id: part.callId,
            content: this.stringifyUnknown(
              Array.isArray(part.content)
                ? part.content
                    .map((item) =>
                      item instanceof vscode.LanguageModelTextPart
                        ? item.value
                        : this.tryReadTextData(item) ?? this.stringifyUnknown(item)
                    )
                    .join('\n')
                : part.content
            ),
          });
          continue;
        }

        const imageUrl = this.tryReadImageUrl(part);
        if (imageUrl) {
          textParts.push({
            type: 'image_url',
            image_url: { url: imageUrl },
          });
          continue;
        }

        const inlineText = this.tryReadTextData(part);
        if (inlineText) {
          textParts.push({ type: 'text', text: inlineText });
          continue;
        }

        textParts.push({ type: 'text', text: this.stringifyUnknown(part) });
      }

      if (assistantToolCalls.length > 0) {
        converted.push({
          role: 'assistant',
          content: textParts.length > 0 ? textParts : null,
          tool_calls: assistantToolCalls,
          name: message.name,
        });
        continue;
      }

      converted.push({
        role,
        content: textParts,
        name: message.name,
      });
    }

    return converted;
  }

  private convertMessagesToResponses(
    messages: readonly vscode.LanguageModelChatRequestMessage[]
  ): ResponsesInputMessage[] {
    const converted: ResponsesInputMessage[] = [];

    for (const message of messages) {
      const role = this.getResponsesRole(message.role);
      const content: ResponsesInputPart[] = [];

      for (const part of message.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content.push({ type: 'input_text', text: part.value });
          continue;
        }

        if (part instanceof vscode.LanguageModelToolCallPart) {
          content.push({
            type: 'function_call',
            call_id: part.callId,
            name: part.name,
            arguments: JSON.stringify(part.input ?? {}),
          });
          this.rememberToolCall(part.callId, part.name);
          continue;
        }

        if (part instanceof vscode.LanguageModelToolResultPart) {
          content.push({
            type: 'function_call_output',
            call_id: part.callId,
            output: this.stringifyToolResultPart(part),
          });
          continue;
        }

        const imageUrl = this.tryReadImageUrl(part);
        if (imageUrl) {
          content.push({ type: 'input_image', image_url: imageUrl });
          continue;
        }

        const fileUrl = this.tryReadFileUrl(part);
        if (fileUrl) {
          content.push({ type: 'input_file', file_url: fileUrl });
          continue;
        }

        const inlineText = this.tryReadTextData(part);
        if (inlineText) {
          content.push({ type: 'input_text', text: inlineText });
          continue;
        }

        content.push({ type: 'input_text', text: this.stringifyUnknown(part) });
      }

      if (content.length === 0) {
        content.push({ type: 'input_text', text: '' });
      }

      converted.push({ role, content });
    }

    return converted;
  }

  private convertMessagesToClaude(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
    system: string;
    messages: ClaudeMessage[];
  } {
    const claudeMessages: ClaudeMessage[] = [];
    const systemParts: string[] = [];

    for (const message of messages) {
      if (
        message.role !== vscode.LanguageModelChatMessageRole.User &&
        message.role !== vscode.LanguageModelChatMessageRole.Assistant
      ) {
        const systemText = this.stringifyRequestMessage(message);
        if (systemText) {
          systemParts.push(systemText);
        }
        continue;
      }

      const role =
        message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user';
      const content: ClaudeContentPart[] = [];

      for (const part of message.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content.push({ type: 'text', text: part.value });
          continue;
        }

        if (part instanceof vscode.LanguageModelToolCallPart) {
          content.push({
            type: 'tool_use',
            id: part.callId,
            name: part.name,
            input: this.ensureObject(part.input),
          });
          this.rememberToolCall(part.callId, part.name);
          continue;
        }

        if (part instanceof vscode.LanguageModelToolResultPart) {
          content.push({
            type: 'tool_result',
            tool_use_id: part.callId,
            content: this.stringifyToolResultPart(part),
          });
          continue;
        }

        const imageUrl = this.tryReadImageUrl(part);
        if (imageUrl) {
          content.push({
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl,
            },
          });
          continue;
        }

        const inlineText = this.tryReadTextData(part);
        if (inlineText) {
          content.push({ type: 'text', text: inlineText });
          continue;
        }

        content.push({ type: 'text', text: this.stringifyUnknown(part) });
      }

      if (content.length === 0) {
        content.push({ type: 'text', text: '' });
      }

      claudeMessages.push({ role, content });
    }

    return {
      system: systemParts.join('\n\n'),
      messages: claudeMessages,
    };
  }

  private convertMessagesToGemini(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
    system: string;
    contents: GeminiMessage[];
  } {
    const contents: GeminiMessage[] = [];
    const systemParts: string[] = [];

    for (const message of messages) {
      if (
        message.role !== vscode.LanguageModelChatMessageRole.User &&
        message.role !== vscode.LanguageModelChatMessageRole.Assistant
      ) {
        const systemText = this.stringifyRequestMessage(message);
        if (systemText) {
          systemParts.push(systemText);
        }
        continue;
      }

      const role =
        message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'model' : 'user';
      const parts: GeminiPart[] = [];

      for (const part of message.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          parts.push({ text: part.value });
          continue;
        }

        if (part instanceof vscode.LanguageModelToolCallPart) {
          parts.push({
            functionCall: {
              name: part.name,
              args: this.ensureObject(part.input),
            },
          });
          this.rememberToolCall(part.callId, part.name);
          continue;
        }

        if (part instanceof vscode.LanguageModelToolResultPart) {
          parts.push({
            functionResponse: {
              name: this.toolNameByCallId.get(part.callId) || 'tool',
              response: {
                output: this.stringifyToolResultPart(part),
              },
            },
          });
          continue;
        }

        const imageUrl = this.tryReadImageUrl(part);
        if (imageUrl) {
          if (imageUrl.startsWith('data:')) {
            const inlineData = this.dataUrlToGeminiInlineData(imageUrl);
            if (inlineData) {
              parts.push({ inlineData });
              continue;
            }
          }

          parts.push({
            file_data: {
              mime_type: this.inferMimeTypeFromUrl(imageUrl),
              file_uri: imageUrl,
            },
          });
          continue;
        }

        if (
          part instanceof vscode.LanguageModelDataPart &&
          typeof part.mimeType === 'string' &&
          part.mimeType.startsWith('image/')
        ) {
          parts.push({
            inlineData: {
              mimeType: part.mimeType,
              data: Buffer.from(part.data).toString('base64'),
            },
          });
          continue;
        }

        const inlineText = this.tryReadTextData(part);
        if (inlineText) {
          parts.push({ text: inlineText });
          continue;
        }

        parts.push({ text: this.stringifyUnknown(part) });
      }

      if (parts.length === 0) {
        parts.push({ text: '' });
      }

      contents.push({ role, parts });
    }

    return {
      system: systemParts.join('\n\n'),
      contents,
    };
  }

  private convertToolsToOpenAI(
    options: vscode.ProvideLanguageModelChatResponseOptions,
    modelConfig: KieProviderModel
  ): OpenAIRequestTool[] {
    if (!modelConfig.enableTools) {
      return [];
    }

    return (options.tools ?? [])
      .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0)
      .map((tool) => ({
        type: 'function',
        function: {
          name: tool.name.trim(),
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
  }

  private convertToolsToResponses(
    options: vscode.ProvideLanguageModelChatResponseOptions,
    modelConfig: KieProviderModel
  ): Array<{
    type: 'function';
    name: string;
    description?: string;
    parameters?: unknown;
  }> {
    if (!modelConfig.enableTools) {
      return [];
    }

    return (options.tools ?? [])
      .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0)
      .map((tool) => ({
        type: 'function',
        name: tool.name.trim(),
        description: tool.description,
        parameters: tool.inputSchema,
      }));
  }

  private convertToolsToClaude(
    options: vscode.ProvideLanguageModelChatResponseOptions,
    modelConfig: KieProviderModel
  ): ClaudeTool[] {
    if (!modelConfig.enableTools) {
      return [];
    }

    return (options.tools ?? [])
      .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0)
      .map((tool) => ({
        name: tool.name.trim(),
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
  }

  private applyAutomaticClaudeCacheControl(
    body: Record<string, unknown>,
    cacheControl: ClaudeCacheControl
  ): void {
    const tools = Array.isArray(body.tools) ? (body.tools as ClaudeTool[]) : [];
    if (tools.length > 0) {
      const lastTool = tools[tools.length - 1];
      if (lastTool && typeof lastTool === 'object' && !lastTool.cache_control) {
        lastTool.cache_control = { ...cacheControl };
      }
    }

    const system = body.system;
    if (typeof system === 'string' && system.trim().length > 0) {
      body.system = [{ type: 'text', text: system, cache_control: { ...cacheControl } }];
    } else if (Array.isArray(system) && system.length > 0) {
      const lastBlock = system[system.length - 1] as ClaudeSystemBlock | undefined;
      if (lastBlock && typeof lastBlock === 'object' && !lastBlock.cache_control) {
        lastBlock.cache_control = { ...cacheControl };
      }
    }

    const messages = Array.isArray(body.messages) ? (body.messages as ClaudeMessage[]) : [];
    if (messages.length === 0) {
      return;
    }

    const messageIndex = messages.length === 1 ? 0 : messages.length - 2;
    const selectedMessage = messages[messageIndex];
    const selectedPart = selectedMessage?.content?.[selectedMessage.content.length - 1];
    if (selectedPart && typeof selectedPart === 'object' && !selectedPart.cache_control) {
      selectedPart.cache_control = { ...cacheControl };
    }
  }

  private convertToolsToGemini(
    options: vscode.ProvideLanguageModelChatResponseOptions,
    modelConfig: KieProviderModel
  ): Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters?: unknown;
    }>;
  }> {
    if (!modelConfig.enableTools) {
      return [];
    }

    const functionDeclarations = (options.tools ?? [])
      .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0)
      .map((tool) => ({
        name: tool.name.trim(),
        description: tool.description,
        parameters: tool.inputSchema,
      }));

    return functionDeclarations.length > 0 ? [{ functionDeclarations }] : [];
  }

  private async consumeStreamingResponse(
    protocol: KieModelProtocol,
    response: Response,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    switch (protocol) {
      case 'openai-responses':
        await this.consumeResponsesStream(response, progress, token);
        return;
      case 'claude':
        await this.consumeClaudeStream(response, progress, token);
        return;
      case 'gemini':
        await this.consumeGeminiStream(response, progress, token);
        return;
      case 'openai-chat':
      default:
        await this.consumeOpenAIChatStream(response, progress, token);
        return;
    }
  }

  private async consumeOpenAIChatStream(
    response: Response,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls = new Map<number, OpenAIToolCall>();

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const lines = event
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('data:'));

          for (const line of lines) {
            const payload = line.slice('data:'.length).trim();
            if (!payload || payload === '[DONE]') {
              continue;
            }

            const parsed = JSON.parse(payload) as OpenAIChatResponse;
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;

            if (typeof delta?.content === 'string' && delta.content.length > 0) {
              progress.report(new vscode.LanguageModelTextPart(delta.content));
            } else if (Array.isArray(delta?.content)) {
              for (const part of delta.content) {
                if (part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
                  progress.report(new vscode.LanguageModelTextPart(part.text));
                }
              }
            }

            for (const toolCall of delta?.tool_calls ?? []) {
              const index = toolCall.index ?? 0;
              const previous = toolCalls.get(index);
              toolCalls.set(index, {
                id: toolCall.id ?? previous?.id ?? `tool-call-${index}`,
                type: 'function',
                function: {
                  name: toolCall.function?.name ?? previous?.function.name ?? `tool_${index}`,
                  arguments:
                    (previous?.function.arguments ?? '') + (toolCall.function?.arguments ?? ''),
                },
              });
            }

            if (choice?.finish_reason === 'tool_calls') {
              this.emitOpenAIToolCalls(progress, toolCalls);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    this.emitOpenAIToolCalls(progress, toolCalls);
  }

  private async consumeResponsesStream(
    response: Response,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls = new Map<string, ToolCallRecord>();

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('event:')) {
            continue;
          }

          const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
          if (!payload || payload === '[DONE]') {
            continue;
          }

          const parsed = JSON.parse(payload) as Record<string, unknown>;
          const eventType = typeof parsed.type === 'string' ? parsed.type : '';

          if (
            eventType === 'response.output_text.delta' &&
            typeof parsed.delta === 'string' &&
            parsed.delta.length > 0
          ) {
            progress.report(new vscode.LanguageModelTextPart(parsed.delta));
            continue;
          }

          if (
            eventType === 'response.function_call_arguments.delta' &&
            typeof parsed.delta === 'string'
          ) {
            const key = String(parsed.item_id ?? parsed.output_index ?? parsed.call_id ?? '0');
            const existing = toolCalls.get(key) ?? {
              callId: String(parsed.call_id ?? key),
              name: typeof parsed.name === 'string' ? parsed.name : `tool_${key}`,
              input: {},
            };
            const previousArgs = this.stringifyUnknown(existing.input);
            existing.input = this.parseToolInput(previousArgs + parsed.delta);
            toolCalls.set(key, existing);
            continue;
          }

          if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
            this.ingestResponsesToolCall(parsed.item, toolCalls);
            if (eventType === 'response.output_item.done') {
              this.emitToolCalls(progress, toolCalls);
            }
            continue;
          }

          if (eventType === 'response.completed') {
            const responsePayload = (parsed.response ?? {}) as ResponsesApiResponse['response'];
            for (const item of responsePayload?.output ?? []) {
              this.ingestResponsesToolCall(item, toolCalls);
            }
            this.emitToolCalls(progress, toolCalls);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    this.emitToolCalls(progress, toolCalls);
  }

  private async consumeClaudeStream(
    response: Response,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolUses = new Map<number, { callId: string; name: string; partialJson: string; input: object }>();

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('event:')) {
            continue;
          }

          const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
          if (!payload || payload === '[DONE]') {
            continue;
          }

          const parsed = JSON.parse(payload) as Record<string, unknown>;
          const eventType = typeof parsed.type === 'string' ? parsed.type : '';

          if (eventType === 'content_block_start') {
            const block = parsed.content_block as
              | { type?: string; id?: string; name?: string; input?: object }
              | undefined;
            if (block?.type === 'tool_use') {
              const key = Number(parsed.index ?? 0);
              toolUses.set(key, {
                callId: block.id || `tool-call-${key}`,
                name: block.name || `tool_${key}`,
                partialJson: '',
                input: this.ensureObject(block.input),
              });
            }
            continue;
          }

          if (eventType === 'content_block_delta') {
            const delta = parsed.delta as
              | { type?: string; text?: string; partial_json?: string; thinking?: string }
              | undefined;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              progress.report(new vscode.LanguageModelTextPart(delta.text));
              continue;
            }
            if (delta?.type === 'input_json_delta') {
              const key = Number(parsed.index ?? 0);
              const existing = toolUses.get(key);
              if (existing) {
                existing.partialJson += delta.partial_json || '';
              }
            }
            continue;
          }

          if (eventType === 'message_delta') {
            const stopReason = (parsed.delta as { stop_reason?: string } | undefined)?.stop_reason;
            if (stopReason === 'tool_use') {
              for (const [key, toolUse] of toolUses.entries()) {
                this.emitToolCall(progress, {
                  callId: toolUse.callId,
                  name: toolUse.name,
                  input: toolUse.partialJson
                    ? this.parseToolInput(toolUse.partialJson)
                    : this.ensureObject(toolUse.input),
                });
                toolUses.delete(key);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    for (const toolUse of toolUses.values()) {
      this.emitToolCall(progress, {
        callId: toolUse.callId,
        name: toolUse.name,
        input: toolUse.partialJson
          ? this.parseToolInput(toolUse.partialJson)
          : this.ensureObject(toolUse.input),
      });
    }
  }

  private async consumeGeminiStream(
    response: Response,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls = new Map<string, ToolCallRecord>();

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('event:')) {
            continue;
          }

          const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
          if (!payload || payload === '[DONE]') {
            continue;
          }

          const parsed = JSON.parse(payload) as GeminiResponse | GeminiResponse[];
          const items = Array.isArray(parsed) ? parsed : [parsed];

          for (const item of items) {
            const candidate = item.candidates?.[0];
            for (const part of candidate?.content?.parts ?? []) {
              if (typeof part.text === 'string' && part.text.length > 0 && !part.thought) {
                progress.report(new vscode.LanguageModelTextPart(part.text));
              }

              if (part.functionCall?.name) {
                const callId = part.functionCall.id || part.functionCall.name;
                toolCalls.set(callId, {
                  callId,
                  name: part.functionCall.name,
                  input: this.ensureObject(part.functionCall.args),
                });
              }
            }

            if (candidate?.finishReason === 'STOP') {
              this.emitToolCalls(progress, toolCalls);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    this.emitToolCalls(progress, toolCalls);
  }

  private reportNonStreamingResponse(
    protocol: KieModelProtocol,
    payload: unknown,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    switch (protocol) {
      case 'openai-responses':
        this.reportResponsesNonStream(payload as ResponsesApiResponse, progress);
        return;
      case 'claude':
        this.reportClaudeNonStream(payload as ClaudeResponse, progress);
        return;
      case 'gemini':
        this.reportGeminiNonStream(payload as GeminiResponse, progress);
        return;
      case 'openai-chat':
      default:
        this.reportOpenAIChatNonStream(payload as OpenAIChatResponse, progress);
        return;
    }
  }

  private reportOpenAIChatNonStream(
    payload: OpenAIChatResponse,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const message = payload.choices?.[0]?.message;
    if (!message) {
      return;
    }

    if (typeof message.content === 'string' && message.content.length > 0) {
      progress.report(new vscode.LanguageModelTextPart(message.content));
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          progress.report(new vscode.LanguageModelTextPart(part.text));
        }
      }
    }

    const toolCalls = new Map<number, ToolCallRecord>();
    for (const [index, toolCall] of (message.tool_calls ?? []).entries()) {
      toolCalls.set(index, {
        callId: toolCall.id,
        name: toolCall.function.name,
        input: this.parseToolInput(toolCall.function.arguments),
      });
    }
    this.emitIndexedToolCalls(progress, toolCalls);
  }

  private reportResponsesNonStream(
    payload: ResponsesApiResponse,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const output = payload.response?.output ?? payload.output ?? [];
    const toolCalls = new Map<string, ToolCallRecord>();

    for (const item of output) {
      if (item.type === 'message') {
        for (const content of item.content ?? []) {
          if (content.type === 'output_text' && typeof content.text === 'string') {
            progress.report(new vscode.LanguageModelTextPart(content.text));
          }
        }
      }
      this.ingestResponsesToolCall(item, toolCalls);
    }

    this.emitToolCalls(progress, toolCalls);
  }

  private reportClaudeNonStream(
    payload: ClaudeResponse,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const content = payload.response?.content ?? payload.content ?? [];
    for (const part of content) {
      if (part.type === 'text' && typeof part.text === 'string') {
        progress.report(new vscode.LanguageModelTextPart(part.text));
      }
      if (part.type === 'tool_use' && typeof part.name === 'string') {
        this.emitToolCall(progress, {
          callId: part.id || part.name,
          name: part.name,
          input: this.ensureObject(part.input),
        });
      }
    }
  }

  private reportGeminiNonStream(
    payload: GeminiResponse,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const candidate = payload.response?.candidates?.[0] ?? payload.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === 'string' && part.text.length > 0 && !part.thought) {
        progress.report(new vscode.LanguageModelTextPart(part.text));
      }

      if (part.functionCall?.name) {
        this.emitToolCall(progress, {
          callId: part.functionCall.id || part.functionCall.name,
          name: part.functionCall.name,
          input: this.ensureObject(part.functionCall.args),
        });
      }
    }
  }

  private emitOpenAIToolCalls(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    toolCalls: Map<number, OpenAIToolCall>
  ): void {
    const indexed = new Map<number, ToolCallRecord>();
    for (const [index, toolCall] of toolCalls.entries()) {
      indexed.set(index, {
        callId: toolCall.id || `tool-call-${index}`,
        name: toolCall.function.name,
        input: this.parseToolInput(toolCall.function.arguments),
      });
    }
    this.emitIndexedToolCalls(progress, indexed);
    toolCalls.clear();
  }

  private emitIndexedToolCalls(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    toolCalls: Map<number, ToolCallRecord>
  ): void {
    for (const [index, toolCall] of toolCalls.entries()) {
      this.emitToolCall(progress, toolCall);
      toolCalls.delete(index);
    }
  }

  private emitToolCalls(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    toolCalls: Map<string, ToolCallRecord>
  ): void {
    for (const [key, toolCall] of toolCalls.entries()) {
      this.emitToolCall(progress, toolCall);
      toolCalls.delete(key);
    }
  }

  private emitToolCall(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    toolCall: ToolCallRecord
  ): void {
    this.rememberToolCall(toolCall.callId, toolCall.name);
    progress.report(
      new vscode.LanguageModelToolCallPart(toolCall.callId, toolCall.name, toolCall.input)
    );
  }

  private ingestResponsesToolCall(
    item: unknown,
    toolCalls: Map<string, ToolCallRecord>
  ): void {
    if (!item || typeof item !== 'object') {
      return;
    }

    const candidate = item as {
      type?: string;
      call_id?: string;
      id?: string;
      name?: string;
      arguments?: string;
      input?: object;
    };
    if (candidate.type !== 'function_call') {
      return;
    }

    const key = candidate.call_id || candidate.id || candidate.name || `tool-${toolCalls.size}`;
    toolCalls.set(key, {
      callId: candidate.call_id || key,
      name: candidate.name || 'function_call',
      input: candidate.arguments
        ? this.parseToolInput(candidate.arguments)
        : this.ensureObject(candidate.input),
    });
  }

  private rememberToolCall(callId: string, name: string): void {
    if (!callId || !name) {
      return;
    }

    this.toolNameByCallId.set(callId, name);
  }

  private getOpenAiRole(role: vscode.LanguageModelChatMessageRole): OpenAIMessage['role'] {
    switch (role) {
      case vscode.LanguageModelChatMessageRole.Assistant:
        return 'assistant';
      case vscode.LanguageModelChatMessageRole.User:
        return 'user';
      default:
        return 'system';
    }
  }

  private getResponsesRole(
    role: vscode.LanguageModelChatMessageRole
  ): ResponsesInputMessage['role'] {
    switch (role) {
      case vscode.LanguageModelChatMessageRole.Assistant:
        return 'assistant';
      case vscode.LanguageModelChatMessageRole.User:
        return 'user';
      default:
        return 'system';
    }
  }

  private stringifyRequestMessage(message: vscode.LanguageModelChatRequestMessage): string {
    return message.content
      .map((part) => {
        if (part instanceof vscode.LanguageModelTextPart) {
          return part.value;
        }
        return this.tryReadTextData(part) ?? this.stringifyUnknown(part);
      })
      .join('\n');
  }

  private stringifyToolResultPart(part: vscode.LanguageModelToolResultPart): string {
    return Array.isArray(part.content)
      ? part.content
          .map((item) =>
            item instanceof vscode.LanguageModelTextPart
              ? item.value
              : this.tryReadTextData(item) ?? this.stringifyUnknown(item)
          )
          .join('\n')
      : this.stringifyUnknown(part.content);
  }

  private readClaudeTopLevelCacheControl(value: unknown): ClaudeCacheControl | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.type !== 'ephemeral') {
      return null;
    }

    if (candidate.ttl === '5m' || candidate.ttl === '1h') {
      return { type: 'ephemeral', ttl: candidate.ttl };
    }

    return { type: 'ephemeral' };
  }

  private normalizeLooseObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private tryReadImageUrl(part: unknown): string | null {
    const candidate = this.asPartCandidate(part);
    if (!candidate) {
      return null;
    }

    if (typeof candidate.value === 'string' && candidate.value.startsWith('http')) {
      return candidate.value;
    }

    if (candidate.value instanceof vscode.Uri) {
      return candidate.value.toString(true);
    }

    if (
      candidate.value &&
      typeof candidate.value === 'object' &&
      'url' in candidate.value &&
      typeof (candidate.value as { url?: unknown }).url === 'string'
    ) {
      return (candidate.value as { url: string }).url;
    }

    if (
      part instanceof vscode.LanguageModelDataPart &&
      typeof part.mimeType === 'string' &&
      part.mimeType.startsWith('image/')
    ) {
      return `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`;
    }

    return null;
  }

  private tryReadFileUrl(part: unknown): string | null {
    const candidate = this.asPartCandidate(part);
    if (!candidate) {
      return null;
    }

    if (typeof candidate.value === 'string' && candidate.value.startsWith('http')) {
      return candidate.value;
    }

    if (candidate.value instanceof vscode.Uri) {
      return candidate.value.toString(true);
    }

    return null;
  }

  private tryReadTextData(part: unknown): string | null {
    if (
      part instanceof vscode.LanguageModelDataPart &&
      typeof part.mimeType === 'string' &&
      part.mimeType.startsWith('text/')
    ) {
      return Buffer.from(part.data).toString('utf8');
    }

    return null;
  }

  private asPartCandidate(
    part: unknown
  ): { value?: unknown; mimeType?: string; data?: Uint8Array } | null {
    if (!part || typeof part !== 'object') {
      return null;
    }

    return part as { value?: unknown; mimeType?: string; data?: Uint8Array };
  }

  private dataUrlToGeminiInlineData(
    dataUrl: string
  ): { mimeType: string; data: string } | null {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      return null;
    }

    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  private inferMimeTypeFromUrl(url: string): string {
    if (url.endsWith('.png')) {
      return 'image/png';
    }
    if (url.endsWith('.webp')) {
      return 'image/webp';
    }
    if (url.endsWith('.gif')) {
      return 'image/gif';
    }
    return 'image/jpeg';
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }

  private parseToolInput(value: string): object {
    const parsed = this.tryParseJson(value);
    if (parsed && typeof parsed === 'object') {
      return parsed as object;
    }

    return { value };
  }

  private ensureObject(value: unknown): object {
    if (value && typeof value === 'object') {
      return value as object;
    }
    return {};
  }

  private stringifyUnknown(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private async getErrorMessage(response: Response): Promise<string> {
    const fallback = `Upstream request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: { message?: string }; msg?: string };
      return payload.error?.message ?? payload.msg ?? fallback;
    } catch {
      try {
        const text = await response.text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }
}
