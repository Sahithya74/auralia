import Anthropic from '@anthropic-ai/sdk';
import { AIProviderError, type AIProvider, type GenerateRequest } from '../types.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
  /** Server-side refusal fallback: a declined request is re-run on a recommended model. */
  refusalFallback: boolean;
}

function toProviderError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AIProviderError('aborted', 'Request cancelled.');
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AIProviderError('timeout', 'The AI service took too long to respond.');
  if (err instanceof Anthropic.APIConnectionError) return new AIProviderError('network', 'Could not reach the AI service.');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AIProviderError('auth', 'The AI service rejected the configured credentials.', err.status);
  }
  if (err instanceof Anthropic.RateLimitError) return new AIProviderError('rate_limit', 'The AI service is rate-limiting requests.', 429);
  if (err instanceof Anthropic.BadRequestError) return new AIProviderError('bad_request', 'The AI service rejected the request.', 400);
  if (err instanceof Anthropic.InternalServerError) return new AIProviderError('overloaded', 'The AI service is temporarily unavailable.', err.status);
  if (err instanceof Anthropic.APIError) return new AIProviderError('unknown', 'The AI service returned an error.', err.status);
  if (err instanceof Error && err.name === 'AbortError') return new AIProviderError('aborted', 'Request cancelled.');
  return new AIProviderError('unknown', 'Unexpected AI provider error.');
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly isMock = false;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.model = options.model;
    // Without an explicit key the SDK falls back to its own credential chain
    // (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile).
    this.client = new Anthropic({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      timeout: options.timeoutMs,
      maxRetries: 1,
    });
  }

  private params(request: GenerateRequest) {
    return {
      model: this.model,
      max_tokens: request.maxTokens ?? this.options.maxTokens,
      system: request.system,
      messages: request.turns,
      // Opus 5.5 always thinks; effort is the latency/depth control. "low" suits conversation.
      output_config: { effort: this.options.effort },
      ...(this.options.refusalFallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    try {
      const stream = this.client.beta.messages.stream(this.params(request), { signal: request.signal });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        throw new AIProviderError('refusal', 'The model declined to continue this reply.');
      }
    } catch (err) {
      throw toProviderError(err);
    }
  }

  async complete(request: GenerateRequest): Promise<string> {
    let text = '';
    for await (const chunk of this.stream(request)) text += chunk;
    return text;
  }
}
