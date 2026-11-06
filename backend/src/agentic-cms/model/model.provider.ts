import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { modelNotConfigured } from '../agent/agent-errors';
import { MODEL_CLIENT, type ModelClient } from './model-client';
import { OpenAICompatibleClient } from './openai-compatible.client';

export const DEFAULT_LUMEN_BASE_URL = 'https://lumen.ncsa.illinois.edu/v1';
export const DEFAULT_LUMEN_MODEL = 'deepseek-v4.1-flash';

/** Used when LUMEN_API_KEY is blank: every request fails with a clear "not configured" error. */
class NotConfiguredModelClient implements ModelClient {
  readonly name = 'not-configured';
  stream(): Promise<never> {
    return Promise.reject(modelNotConfigured());
  }
}

/**
 * Builds the model client from LUMEN_* settings. Creating a client makes no
 * network request. There is deliberately no fake-model fallback outside tests:
 * a missing key must show an error, never a placeholder answer.
 */
export function createModelClient(config: Pick<ConfigService, 'get'>, log = new Logger('OtcrBotModel')): ModelClient {
  const apiKey = config.get<string>('LUMEN_API_KEY')?.trim();
  if (!apiKey) {
    log.warn('LUMEN_API_KEY is not set: OTCR Bot requests will fail with "not configured".');
    return new NotConfiguredModelClient();
  }
  const baseUrl = config.get<string>('LUMEN_BASE_URL')?.trim() || DEFAULT_LUMEN_BASE_URL;
  const model = config.get<string>('LUMEN_MODEL')?.trim() || DEFAULT_LUMEN_MODEL;
  log.log(`OTCR Bot model: ${model} via ${baseUrl}`);
  return new OpenAICompatibleClient(baseUrl, apiKey, model);
}

export const modelClientProvider: Provider = {
  provide: MODEL_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => createModelClient(config),
};
