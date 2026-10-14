// Provider-neutral contract for language models. Chat code depends only on this,
// so another provider can be added in src/ai/providers/ without touching it.

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  system: string;
  turns: ChatTurn[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** True for the development mock: its replies are not real AI output. */
  readonly isMock: boolean;
  /** Yields text fragments as they are generated. Throws AIProviderError. */
  stream(request: GenerateRequest): AsyncIterable<string>;
  complete(request: GenerateRequest): Promise<string>;
}

export type AIErrorKind =
  | 'not_configured'
  | 'auth'
  | 'rate_limit'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'refusal'
  | 'bad_request'
  | 'aborted'
  | 'unknown';

const RETRYABLE: ReadonlySet<AIErrorKind> = new Set(['rate_limit', 'overloaded', 'timeout', 'network']);

export class AIProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly kind: AIErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.retryable = RETRYABLE.has(kind);
  }
}
