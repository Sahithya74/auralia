export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental parser for text/event-stream. Handles frames split across network chunks. */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = '';
  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length) onMessage({ event, data: data.join('\n') });
      }
    },
  };
}
