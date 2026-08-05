const assert = require('node:assert/strict');
const { SseDecoder } = require('../out/sse');

const decoder = new SseDecoder();
const chunks = [
  'event: content_block_',
  'delta\r\ndata: {"type":"content_',
  'block_delta","delta":{"type":"text_delta",',
  '"text":"ok"}}\r',
  '\n\r\n',
  'data: [DONE]\n\n',
];
const events = chunks.flatMap((chunk) => decoder.push(chunk));
events.push(...decoder.finish());

assert.deepEqual(events, [
  {
    event: 'content_block_delta',
    data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
  },
]);
console.log('SSE split-boundary test passed');
