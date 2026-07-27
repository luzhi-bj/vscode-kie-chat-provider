# Changelog

## 0.0.6

- Added the built-in KIE Claude Opus 5 model.

## 0.0.5

- Added the built-in KIE Claude Opus 4.7, Claude Fable 5, and Claude Sonnet 5 models.
- Disabled tool calling for Claude Fable 5 to match KIE's documented capabilities.
- Added the built-in KIE GPT 5.5, GPT 5.6 Luna, GPT 5.6 Terra, and GPT 5.6 Sol models.
- Added automatic Responses API tool selection when function tools are available.

## 0.0.3

- Added the built-in KIE Claude Opus 4.8 model.

## 0.0.1

- Initial scaffold for a VS Code language model chat provider.
- Defaulted to KIE Gemini 3.1 Pro's OpenAI-compatible endpoint.
- Added API key management through VS Code secret storage.
- Added configurable endpoint, model metadata, tool mode, and SSE streaming support.
- Added multi-model configuration through `kieChatProvider.models`.
- Added per-model auth settings, request body overrides, and secret slots.
- Added the built-in KIE chat model catalog from the official KIE market docs.
- Added protocol-aware request/response handling for OpenAI chat, OpenAI responses, Claude messages, and native Gemini streaming.
- Added settings to disable specific built-in KIE models or override them with custom definitions.
- Added automatic Claude cache-control expansion for the built-in KIE Claude models.
