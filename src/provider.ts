import * as vscode from 'vscode';
import {
  getEffectiveModelConfigs,
  getSecretTargets,
  KieModelProtocol,
  KieProviderModel,
  KieSecretTarget,
} from './settings';
import { SseDecoder, SseEvent } from './sse';

type Json = Record<string, unknown>;
type UpstreamRequest = { body: Json; parse: StreamParser };
type StreamParser = (
  response: Response,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
) => Promise<void>;

/**
 * VS Code/Copilot bridge. This class owns provider lifecycle and credentials only.
 * Every request is converted and parsed by a stateless protocol adapter.
 */
export class KieChatModelProvider
  implements vscode.LanguageModelChatProvider, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  dispose(): void {
    this.changeEmitter.dispose();
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const models = getEffectiveModelConfigs();
    const available: KieProviderModel[] = [];
    for (const model of models) {
      if (await this.context.secrets.get(model.apiKeySecretKey)) {
        available.push(model);
      }
    }

    if (available.length === 0 && !options.silent) {
      const configured = await this.promptForApiKey();
      if (configured) {
        return this.provideLanguageModelChatInformation({ silent: true }, _token);
      }
    }

    return available.map((model) => ({
      id: model.id,
      name: model.displayName,
      family: model.family,
      version: model.vendorVersion,
      tooltip: model.tooltip,
      detail: model.detail,
      maxInputTokens: model.maxInputTokens,
      maxOutputTokens: model.maxOutputTokens,
      capabilities: {
        imageInput: model.enableVision,
        toolCalling: model.enableTools,
      },
    }));
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const config = this.findModel(model.id);
    const apiKey = await this.context.secrets.get(config.apiKeySecretKey);
    if (!apiKey) {
      throw new Error(
        `Missing credential for ${config.displayName}. Run "KIE Chat Provider: Configure Credential".`
      );
    }

    const request = createUpstreamRequest(config, messages, options);
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: createHeaders(config, apiKey),
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response));
      }
      await request.parse(response, progress, token);
    } finally {
      cancellation.dispose();
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    input: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const text =
      typeof input === 'string'
        ? input
        : input.content.map((part) => partToText(part)).join('\n');
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async promptForApiKey(secretKey?: string): Promise<boolean> {
    const target = await this.pickSecretTarget(secretKey);
    if (!target) {
      return false;
    }
    const current = await this.context.secrets.get(target.secretKey);
    const value = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      password: true,
      prompt: `Enter credential for ${target.label}.`,
      value: current ?? '',
      validateInput: (candidate) =>
        candidate.trim() ? null : 'A credential is required.',
    });
    if (!value) {
      return false;
    }
    await this.context.secrets.store(target.secretKey, value.trim());
    this.changeEmitter.fire();
    return true;
  }

  async clearApiKey(secretKey?: string): Promise<void> {
    const target = await this.pickSecretTarget(secretKey, 'Select credential to clear.');
    if (!target) {
      return;
    }
    await this.context.secrets.delete(target.secretKey);
    this.changeEmitter.fire();
  }

  private findModel(id: string): KieProviderModel {
    const model = getEffectiveModelConfigs().find((candidate) => candidate.id === id);
    if (!model) {
      throw new Error(`KIE model "${id}" is no longer configured.`);
    }
    return model;
  }

  private async pickSecretTarget(
    secretKey?: string,
    placeHolder = 'Select credential to configure.'
  ): Promise<KieSecretTarget | undefined> {
    const targets = getSecretTargets(getEffectiveModelConfigs());
    if (secretKey) {
      return targets.find((target) => target.secretKey === secretKey);
    }
    if (targets.length <= 1) {
      return targets[0];
    }
    const selected = await vscode.window.showQuickPick(
      targets.map((target) => ({
        label: target.label,
        description: target.description,
        detail: target.detail,
        target,
      })),
      { placeHolder, ignoreFocusOut: true }
    );
    return selected?.target;
  }
}

function createUpstreamRequest(
  model: KieProviderModel,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions
): UpstreamRequest {
  switch (model.protocol) {
    case 'claude':
      return {
        body: buildClaudeBody(model, messages, options),
        parse: parseClaudeResponse,
      };
    case 'openai-responses':
      return {
        body: buildResponsesBody(model, messages, options),
        parse: parseResponsesResponse,
      };
    case 'gemini':
      return {
        body: buildGeminiBody(model, messages, options),
        parse: parseGeminiResponse,
      };
    case 'openai-chat':
    default:
      return {
        body: buildOpenAIChatBody(model, messages, options),
        parse: parseOpenAIChatResponse,
      };
  }
}

function createHeaders(model: KieProviderModel, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...model.extraHeaders,
  };
  if (model.authHeader) {
    headers[model.authHeader] = model.authScheme
      ? `${model.authScheme} ${apiKey}`
      : apiKey;
  }
  return headers;
}

function buildOpenAIChatBody(
  model: KieProviderModel,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json {
  const converted: Json[] = [];
  for (const message of messages) {
    const role = roleName(message.role);
    const text: Json[] = [];
    const toolCalls: Json[] = [];
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        text.push({ type: 'text', text: part.value });
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        converted.push({
          role: 'tool',
          tool_call_id: part.callId,
          content: toolResultText(part),
        });
      } else {
        const image = imageUrl(part);
        if (image) {
          text.push({ type: 'image_url', image_url: { url: image } });
        } else {
          text.push({ type: 'text', text: partToText(part) });
        }
      }
    }
    if (toolCalls.length) {
      converted.push({ role: 'assistant', content: text.length ? text : null, tool_calls: toolCalls });
    } else if (text.length) {
      converted.push({ role, content: text });
    }
  }
  const body: Json = { ...model.extraBody, messages: converted };
  if (model.stream) body.stream = true;
  if (model.sendModelInBody) body.model = model.requestModel;
  const tools = openAITools(model, options);
  if (tools.length) {
    body.tools = tools;
    body.tool_choice =
      options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
  }
  return body;
}

function buildResponsesBody(
  model: KieProviderModel,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json {
  const input: Json[] = [];
  for (const message of messages) {
    const role = roleName(message.role);
    const textType = role === 'assistant' ? 'output_text' : 'input_text';
    const content: Json[] = [];
    const flush = () => {
      if (content.length) input.push({ role, content: content.splice(0) });
    };
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        content.push({ type: textType, text: part.value });
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        flush();
        input.push({
          type: 'function_call',
          call_id: part.callId,
          name: part.name,
          arguments: JSON.stringify(part.input ?? {}),
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        flush();
        input.push({
          type: 'function_call_output',
          call_id: part.callId,
          output: toolResultText(part),
        });
      } else {
        content.push({ type: textType, text: partToText(part) });
      }
    }
    flush();
  }
  const body: Json = {
    ...model.extraBody,
    model: model.requestModel,
    input,
  };
  if (model.stream) body.stream = true;
  const tools = responseTools(model, options);
  if (tools.length) {
    body.tools = tools;
    body.tool_choice =
      options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
  }
  return body;
}

function buildClaudeBody(
  model: KieProviderModel,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json {
  const extraBody = { ...model.extraBody };
  const cacheControl = asJson(extraBody.cache_control);
  delete extraBody.cache_control;
  const system: string[] = [];
  const converted: Json[] = [];
  for (const message of messages) {
    if (
      message.role !== vscode.LanguageModelChatMessageRole.User &&
      message.role !== vscode.LanguageModelChatMessageRole.Assistant
    ) {
      system.push(message.content.map(partToText).join('\n'));
      continue;
    }
    const role =
      message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user';
    const content: Json[] = [];
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        content.push({ type: 'text', text: part.value });
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        content.push({ type: 'tool_use', id: part.callId, name: part.name, input: part.input ?? {} });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        content.push({
          type: 'tool_result',
          tool_use_id: part.callId,
          content: toolResultText(part),
        });
      } else {
        content.push({ type: 'text', text: partToText(part) });
      }
    }
    converted.push({ role, content: content.length ? content : [{ type: 'text', text: '' }] });
  }
  const body: Json = {
    ...extraBody,
    model: model.requestModel,
    messages: converted,
  };
  if (system.length) {
    body.system =
      cacheControl.type === 'ephemeral'
        ? [{ type: 'text', text: system.join('\n\n'), cache_control: cacheControl }]
        : system.join('\n\n');
  }
  if (model.stream) body.stream = true;
  const tools = claudeTools(model, options);
  if (tools.length) {
    if (cacheControl.type === 'ephemeral') {
      tools[tools.length - 1] = {
        ...tools[tools.length - 1],
        cache_control: cacheControl,
      };
    }
    body.tools = tools;
  }
  if (cacheControl.type === 'ephemeral' && converted.length) {
    const messageIndex = converted.length === 1 ? 0 : converted.length - 2;
    const message = converted[messageIndex];
    const content = asArray(message.content);
    if (content.length) {
      content[content.length - 1] = {
        ...asJson(content[content.length - 1]),
        cache_control: cacheControl,
      };
      message.content = content;
    }
  }
  return body;
}

function buildGeminiBody(
  model: KieProviderModel,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json {
  const system: string[] = [];
  const contents: Json[] = [];
  for (const message of messages) {
    if (
      message.role !== vscode.LanguageModelChatMessageRole.User &&
      message.role !== vscode.LanguageModelChatMessageRole.Assistant
    ) {
      system.push(message.content.map(partToText).join('\n'));
      continue;
    }
    const role =
      message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'model' : 'user';
    const parts: Json[] = [];
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        parts.push({ text: part.value });
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        parts.push({ functionCall: { id: part.callId, name: part.name, args: part.input ?? {} } });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        parts.push({
          functionResponse: {
            id: part.callId,
            name: part.callId,
            response: { result: toolResultText(part) },
          },
        });
      } else {
        parts.push({ text: partToText(part) });
      }
    }
    contents.push({ role, parts });
  }
  const body: Json = { ...model.extraBody, contents };
  if (system.length) body.systemInstruction = { parts: [{ text: system.join('\n\n') }] };
  const declarations = geminiTools(model, options);
  if (declarations.length) body.tools = [{ functionDeclarations: declarations }];
  return body;
}

function openAITools(
  model: KieProviderModel,
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json[] {
  if (!model.enableTools) return [];
  return (options.tools ?? []).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: objectSchema(tool.inputSchema),
    },
  }));
}

function responseTools(
  model: KieProviderModel,
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json[] {
  if (!model.enableTools) return [];
  return (options.tools ?? []).map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: objectSchema(tool.inputSchema),
  }));
}

function claudeTools(
  model: KieProviderModel,
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json[] {
  if (!model.enableTools) return [];
  return (options.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: objectSchema(tool.inputSchema),
  }));
}

function geminiTools(
  model: KieProviderModel,
  options: vscode.ProvideLanguageModelChatResponseOptions
): Json[] {
  if (!model.enableTools) return [];
  return (options.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: objectSchema(tool.inputSchema),
  }));
}

async function parseOpenAIChatResponse(
  response: Response,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  if (!isEventStream(response)) {
    const json = asJson(await response.json());
    const message = asJson(asArray(json.choices)[0]).message;
    emitOpenAIMessage(asJson(message), progress);
    return;
  }
  const calls = new Map<number, { id: string; name: string; args: string }>();
  for await (const event of sse(response, token)) {
    const json = parseJson(event.data);
    for (const choice of asArray(json.choices)) {
      const delta = asJson(asJson(choice).delta);
      if (typeof delta.content === 'string') {
        progress.report(new vscode.LanguageModelTextPart(delta.content));
      }
      for (const rawCall of asArray(delta.tool_calls)) {
        const call = asJson(rawCall);
        const index = number(call.index);
        const fn = asJson(call.function);
        const current = calls.get(index) ?? { id: '', name: '', args: '' };
        if (typeof call.id === 'string') current.id = call.id;
        if (typeof fn.name === 'string') current.name = fn.name;
        if (typeof fn.arguments === 'string') current.args += fn.arguments;
        calls.set(index, current);
      }
      const finish = asJson(choice).finish_reason;
      if (finish === 'tool_calls') emitIndexedCalls(calls, progress);
    }
  }
  emitIndexedCalls(calls, progress);
}

async function parseResponsesResponse(
  response: Response,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  if (!isEventStream(response)) {
    emitResponsesPayload(asJson(await response.json()), progress, new Set(), true);
    return;
  }
  const emitted = new Set<string>();
  const argDeltas = new Map<string, string>();
  let emittedText = false;
  for await (const event of sse(response, token)) {
    const json = parseJson(event.data);
    const type = string(json.type) || event.event;
    if (type === 'response.output_text.delta' && typeof json.delta === 'string') {
      progress.report(new vscode.LanguageModelTextPart(json.delta));
      emittedText = true;
    } else if (type === 'response.function_call_arguments.delta') {
      const key = string(json.call_id) || string(json.item_id);
      if (key && typeof json.delta === 'string') {
        argDeltas.set(key, (argDeltas.get(key) ?? '') + json.delta);
      }
    } else if (type === 'response.output_item.done') {
      emittedText =
        emitResponseItem(asJson(json.item), progress, emitted, argDeltas, !emittedText) ||
        emittedText;
    } else if (type === 'response.completed') {
      emittedText =
        emitResponsesPayload(asJson(json.response), progress, emitted, !emittedText) ||
        emittedText;
    }
  }
}

async function parseClaudeResponse(
  response: Response,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  if (!isEventStream(response)) {
    const json = asJson(await response.json());
    emitClaudeContent(asArray(json.content ?? asJson(json.response).content), progress);
    return;
  }
  const calls = new Map<number, { id: string; name: string; args: string; input: Json }>();
  const emitted = new Set<string>();
  const flush = (index?: number) => {
    for (const [key, call] of calls) {
      if (index !== undefined && key !== index) continue;
      if (!emitted.has(call.id)) {
        progress.report(
          new vscode.LanguageModelToolCallPart(
            call.id,
            call.name,
            call.args ? parseJson(call.args) : call.input
          )
        );
        emitted.add(call.id);
      }
      calls.delete(key);
    }
  };
  for await (const event of sse(response, token)) {
    const json = parseJson(event.data);
    const type = string(json.type) || event.event;
    const index = number(json.index);
    if (type === 'content_block_start') {
      const block = asJson(json.content_block);
      if (block.type === 'tool_use') {
        calls.set(index, {
          id: string(block.id) || `tool-${index}`,
          name: string(block.name) || `tool_${index}`,
          args: '',
          input: asJson(block.input),
        });
      }
    } else if (type === 'content_block_delta') {
      const delta = asJson(json.delta);
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        progress.report(new vscode.LanguageModelTextPart(delta.text));
      } else if (delta.type === 'input_json_delta') {
        const call = calls.get(index);
        if (call && typeof delta.partial_json === 'string') call.args += delta.partial_json;
      }
    } else if (type === 'content_block_stop') {
      flush(index);
    } else if (type === 'message_stop' || type === 'message_delta') {
      flush();
    } else if (type === 'error') {
      throw new Error(string(asJson(json.error).message) || 'Claude stream failed.');
    }
  }
  flush();
}

async function parseGeminiResponse(
  response: Response,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  if (!isEventStream(response)) {
    emitGeminiPayload(asJson(await response.json()), progress);
    return;
  }
  for await (const event of sse(response, token)) {
    emitGeminiPayload(parseJson(event.data), progress);
  }
}

async function* sse(
  response: Response,
  token: vscode.CancellationToken
): AsyncGenerator<SseEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const eventDecoder = new SseDecoder();
  try {
    while (!token.isCancellationRequested) {
      const chunk = await reader.read();
      const text = textDecoder.decode(chunk.value, { stream: !chunk.done });
      for (const event of eventDecoder.push(text)) yield event;
      if (chunk.done) break;
    }
    for (const event of eventDecoder.finish()) yield event;
  } finally {
    reader.releaseLock();
  }
}

function emitOpenAIMessage(
  message: Json,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  if (typeof message.content === 'string') {
    progress.report(new vscode.LanguageModelTextPart(message.content));
  }
  for (const raw of asArray(message.tool_calls)) {
    const call = asJson(raw);
    const fn = asJson(call.function);
    progress.report(
      new vscode.LanguageModelToolCallPart(
        string(call.id) || string(fn.name),
        string(fn.name),
        parseJson(string(fn.arguments) || '{}')
      )
    );
  }
}

function emitIndexedCalls(
  calls: Map<number, { id: string; name: string; args: string }>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  for (const [index, call] of calls) {
    progress.report(
      new vscode.LanguageModelToolCallPart(
        call.id || `tool-${index}`,
        call.name || `tool_${index}`,
        parseJson(call.args || '{}')
      )
    );
    calls.delete(index);
  }
}

function emitResponsesPayload(
  payload: Json,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  emitted: Set<string>,
  allowText: boolean
): boolean {
  const normalized = Object.keys(asJson(payload.data)).length ? asJson(payload.data) : payload;
  const output = asArray(normalized.output ?? asJson(normalized.response).output);
  let emittedText = false;
  for (const item of output) {
    emittedText =
      emitResponseItem(asJson(item), progress, emitted, new Map(), allowText && !emittedText) ||
      emittedText;
  }
  return emittedText;
}

function emitResponseItem(
  item: Json,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  emitted: Set<string>,
  deltas: Map<string, string>,
  allowText: boolean
): boolean {
  let emittedText = false;
  if (item.type === 'message') {
    for (const part of asArray(item.content)) {
      const content = asJson(part);
      if (
        allowText &&
        content.type === 'output_text' &&
        typeof content.text === 'string'
      ) {
        progress.report(new vscode.LanguageModelTextPart(content.text));
        emittedText = true;
      }
    }
  } else if (item.type === 'function_call') {
    const callId = string(item.call_id) || string(item.id);
    if (callId && !emitted.has(callId)) {
      const args = string(item.arguments) || deltas.get(callId) || '{}';
      progress.report(
        new vscode.LanguageModelToolCallPart(callId, string(item.name), parseJson(args))
      );
      emitted.add(callId);
    }
  }
  return emittedText;
}

function emitClaudeContent(
  content: unknown[],
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  for (const raw of content) {
    const part = asJson(raw);
    if (part.type === 'text' && typeof part.text === 'string') {
      progress.report(new vscode.LanguageModelTextPart(part.text));
    } else if (part.type === 'tool_use') {
      progress.report(
        new vscode.LanguageModelToolCallPart(
          string(part.id) || string(part.name),
          string(part.name),
          asJson(part.input)
        )
      );
    }
  }
}

function emitGeminiPayload(
  payload: Json,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const normalized = Object.keys(asJson(payload.data)).length ? asJson(payload.data) : payload;
  for (const candidate of asArray(normalized.candidates ?? asJson(normalized.response).candidates)) {
    for (const raw of asArray(asJson(asJson(candidate).content).parts)) {
      const part = asJson(raw);
      if (typeof part.text === 'string' && !part.thought) {
        progress.report(new vscode.LanguageModelTextPart(part.text));
      }
      const call = asJson(part.functionCall);
      if (call.name) {
        progress.report(
          new vscode.LanguageModelToolCallPart(
            string(call.id) || string(call.name),
            string(call.name),
            asJson(call.args)
          )
        );
      }
    }
  }
}

async function readHttpError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = asJson(JSON.parse(text));
    return (
      string(asJson(json.error).message) ||
      string(json.message) ||
      string(json.msg) ||
      `${response.status} ${response.statusText}`
    );
  } catch {
    return text.trim() || `${response.status} ${response.statusText}`;
  }
}

function isEventStream(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/event-stream');
}

function roleName(role: vscode.LanguageModelChatMessageRole): 'user' | 'assistant' {
  return role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user';
}

function toolResultText(part: vscode.LanguageModelToolResultPart): string {
  return part.content.map(partToText).join('\n');
}

function partToText(part: unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) return part.value;
  if (typeof part === 'string') return part;
  const candidate = asJson(part);
  if (typeof candidate.value === 'string') return candidate.value;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function imageUrl(part: unknown): string | undefined {
  const candidate = asJson(part);
  const mime = string(candidate.mimeType);
  const data = candidate.data;
  if (mime.startsWith('image/') && data instanceof Uint8Array) {
    return `data:${mime};base64,${Buffer.from(data).toString('base64')}`;
  }
  return undefined;
}

function objectSchema(value: object | undefined): Json {
  const schema = asJson(value);
  return {
    ...schema,
    type: string(schema.type) || 'object',
    properties: asJson(schema.properties),
  };
}

function parseJson(value: string): Json {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return asJson(parsed);
  } catch (error) {
    throw new Error(`Invalid upstream JSON: ${error instanceof Error ? error.message : error}`);
  }
}

function asJson(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
