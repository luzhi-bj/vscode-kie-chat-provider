# Changelog

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
