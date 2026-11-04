import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeModelClient } from './fake-test-model.client';
import { MODEL_CLIENT, type ModelClient } from './model-client';
import { OpenAICompatibleClient } from './openai-compatible.client';

const DEFAULT_LUMEN_BASE_URL = 'https://lumen.ncsa.illinois.edu/v1';
const DEFAULT_LUMEN_MODEL = 'deepseek-v4.1-flash';

export function createModelClient(config: Pick<ConfigService, 'get'>, log = new Logger('OtcrBotModel')): ModelClient {
  const apiKey = config.get<string>('LUMEN_API_KEY')?.trim();
  if (!apiKey) {
    log.warn('LUMEN_API_KEY is not set: OTCR Bot is using the FAKE model.');
    return new FakeModelClient();
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