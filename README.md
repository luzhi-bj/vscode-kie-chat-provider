# KIE Chat Provider

This VS Code extension contributes a multi-model provider to the Copilot model picker by using the `LanguageModelChatProvider` API introduced in VS Code `1.104`.

It now ships with the current KIE chat model catalog from the official KIE market docs, and it can also layer in your own custom OpenAI-compatible models.

## Built-in KIE models

When `kieChatProvider.includeBuiltInKieModels` is `true`, the extension exposes these KIE models by default:

- GPT: `gpt-5-2`, `gpt-5-4`
- Claude: `claude-haiku-4-5`, `claude-opus-4-5`, `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-sonnet-4-6`
- Gemini: `gemini-2.5-pro`, `gemini-3-pro`, `gemini-3.1-pro`, `gemini-2.5-flash`, `gemini-3-flash`, `gemini-3-flash-v1betamodels`
- Codex: `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.2-codex`, `gpt-5.3-codex`

These models are wired to the protocol documented by KIE:

- `openai-chat`: `/v1/chat/completions`
- `openai-responses`: `/v1/responses`
- `claude`: `/claude/v1/messages`
- `gemini`: `streamGenerateContent`

## Why this project exists

The existing `kie.ai` web codebase mixes multiple request styles behind a fixed gateway:

- GPT 5.2 and Gemini OpenAI variants use chat/completions
- GPT 5.4 and Codex use responses-style payloads
- Claude uses `/claude/v1/messages`
- Native Gemini uses `streamGenerateContent`

For VS Code BYOK / provider-extension usage, a protocol-aware direct provider is cleaner than trying to force every model through one fixed branch.

## Important VS Code limitations

- Models added through BYOK or a provider extension currently apply to chat and inline chat, not GitHub Copilot inline suggestions.
- The user still needs a Copilot plan and online access.
- For Business or Enterprise plans, admins must enable the BYOK policy before extension-provided models are usable.

## Setup

1. Run `npm install`.
2. Open this folder in VS Code.
3. Press `F5` to launch the Extension Development Host.
4. Run `KIE Chat Provider: Configure Credential` from the Command Palette.
5. Open the Copilot model picker and choose a KIE model.

## Example settings

### Use the built-in KIE catalog

```json
{
  "kieChatProvider.defaultApiKeySecretKey": "kieChatProvider.kieApiKey",
  "kieChatProvider.includeBuiltInKieModels": true
}
```

### Hide a few built-in models

```json
{
  "kieChatProvider.disabledBuiltInModelIds": [
    "gemini-3-flash-v1betamodels",
    "claude-opus-4-6"
  ]
}
```

### Add custom models on top of the built-ins

```json
{
  "kieChatProvider.defaultApiKeySecretKey": "kieChatProvider.kieApiKey",
  "kieChatProvider.includeBuiltInKieModels": true,
  "kieChatProvider.models": [
    {
      "id": "my-openai-compatible-model",
      "displayName": "My OpenAI-Compatible Model",
      "endpoint": "https://api.example.com/v1/chat/completions",
      "protocol": "openai-chat",
      "requestModel": "my-real-upstream-model-name",
      "family": "openai-compatible",
      "enableVision": false,
      "enableTools": true,
      "stream": true,
      "sendModelInBody": true,
      "apiKeySecretKey": "kieChatProvider.thirdPartyApiKey",
      "authHeader": "x-api-key",
      "authScheme": "",
      "extraHeaders": {
        "x-provider-project": "demo"
      },
      "extraBody": {
        "temperature": 0.2
      }
    }
  ]
}
```

### Override a built-in KIE model

If a custom entry uses the same `id` as a built-in model, the custom entry wins:

```json
{
  "kieChatProvider.models": [
    {
      "id": "gemini-3.1-pro",
      "displayName": "Gemini 3.1 Pro (Custom KIE)",
      "endpoint": "https://api.kie.ai/gemini-3.1-pro/v1/chat/completions",
      "protocol": "openai-chat",
      "family": "gemini",
      "stream": true,
      "enableVision": true,
      "enableTools": true,
      "extraBody": {
        "include_thoughts": false,
        "reasoning_effort": "medium"
      }
    }
  ]
}
```

## Multi-model notes

- Built-in KIE models share one API key by default through `kieChatProvider.defaultApiKeySecretKey`.
- `apiKeySecretKey` lets custom models share one secret or use separate secrets.
- `requestModel` is used when the selected protocol needs a `model` field.
- `extraBody` is the easiest way to pass provider-specific fields such as `reasoning`, `reasoning_effort`, `thinkingFlag`, or `generationConfig`.
- Built-in Claude models now treat top-level `cache_control: { "type": "ephemeral" }` as an automatic prompt-caching hint and expand it onto Claude cacheable blocks before the request is sent.
- If you disable the built-in catalog and leave `kieChatProvider.models` empty, the extension falls back to the original single-model legacy settings.

## Settings

- `kieChatProvider.includeBuiltInKieModels`
- `kieChatProvider.disabledBuiltInModelIds`
- `kieChatProvider.models`
- `kieChatProvider.defaultApiKeySecretKey`
- legacy fallback settings:
- `kieChatProvider.endpoint`
- `kieChatProvider.modelId`
- `kieChatProvider.displayName`
- `kieChatProvider.family`
- `kieChatProvider.vendorVersion`
- `kieChatProvider.maxInputTokens`
- `kieChatProvider.maxOutputTokens`
- `kieChatProvider.enableVision`
- `kieChatProvider.enableTools`
- `kieChatProvider.includeThoughts`
- `kieChatProvider.reasoningEffort`
- `kieChatProvider.sendModelInBody`
- `kieChatProvider.extraHeaders`

## Notes

- The extension streams SSE responses from OpenAI-compatible, Claude, responses-style, and native Gemini upstreams.
- VS Code tool definitions are translated into the format required by each upstream protocol.
- Credentials are stored in VS Code secret storage, not in settings.
