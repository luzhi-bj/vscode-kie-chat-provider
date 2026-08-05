export interface SseEvent {
  event: string;
  data: string;
}

/** Stateful SSE decoder. Network chunks may split at any byte boundary. */
export class SseDecoder {
  private buffer = '';
  private eventName = '';
  private data: string[] = [];

  push(text: string): SseEvent[] {
    this.buffer += text;
    const events: SseEvent[] = [];
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      this.consumeLine(line, events);
    }
    return events;
  }

  finish(text = ''): SseEvent[] {
    const events = this.push(text);
    if (this.buffer) {
      this.consumeLine(this.buffer, events);
      this.buffer = '';
    }
    const final = this.dispatch();
    if (final) events.push(final);
    return events;
  }

  private consumeLine(line: string, events: SseEvent[]): void {
    if (!line) {
      const event = this.dispatch();
      if (event) events.push(event);
    } else if (line.startsWith('event:')) {
      this.eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      this.data.push(line.slice(5).trimStart());
    }
  }

  private dispatch(): SseEvent | undefined {
    if (!this.data.length) return undefined;
    const event = { event: this.eventName, data: this.data.join('\n') };
    this.eventName = '';
    this.data = [];
    return event.data === '[DONE]' ? undefined : event;
  }
}
