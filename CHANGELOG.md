# Changelog

## 0.0.31

- Deduplicate Responses text repeated across delta, output-item-done, and response-completed events.
- Use completed response text only as a fallback when no streaming text delta was received.

## 0.0.30

- Remove unsupported top-level Claude `cache_control` before sending requests.
- Encode KIE Claude prompt-caching markers on supported system, tool, and message content blocks.

## 0.0.29

- Stop sending Anthropic `tool_choice` to KIE's Claude v1 compatibility endpoint.
- Continue sending Copilot tools and multi-turn `tool_use`/`tool_result` history without the unsupported selector.

## 0.0.28

- Rewrote the provider around the official VS Code `LanguageModelChatProvider` contract.
- Added stateless, isolated adapters for OpenAI Chat, OpenAI Responses, Claude, and Gemini.
- Emit Claude tool calls on `content_block_stop` and preserve Copilot tool-call/result roles.
- Removed implicit fallback requests, retries, response decompression guesses, and cross-request tool state.
- Added an SSE split-boundary regression test.

## 0.0.10

- Surface KIE Responses API failed and incomplete stream events with their actual error details.
- Added stream event diagnostics and compatible text-delta parsing.

## 0.0.9

- Fixed Responses API tool-call history by emitting `function_call` and `function_call_output` as top-level input items.
- Deduplicated streamed tool calls repeated in both item-completed and response-completed events.

## 0.0.8

- Added support for wrapped and full-object KIE Responses API stream events.
- Fixed accumulation of streamed function-call argument fragments.

## 0.0.7

- Updated the VS Code language model provider API baseline to 1.125.
- Added explicit diagnostics when a KIE response finishes without text or tool-call output.
- Documented troubleshooting for GitHub Copilot MCP server startup failures.

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
