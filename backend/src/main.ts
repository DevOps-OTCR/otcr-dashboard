import 'module-alias/register';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const normalizeOrigin = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed === '*') return '*';
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  };

  const explicitOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
  const defaultFrontend = normalizeOrigin(process.env.FRONTEND_URL || '');
  const allowAllOrigins = explicitOrigins.includes('*') || defaultFrontend === '*';
  const allowedOrigins = new Set(
    [
      defaultFrontend,
      ...explicitOrigins,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ].filter(Boolean),
  );

  // Enable CORS for frontend
  app.enableCors({
    origin: (origin, callback) => {
      const normalizedOrigin = origin ? normalizeOrigin(origin) : origin;
      if (!normalizedOrigin || allowAllOrigins || allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Backend server running on http://localhost:${port}`);
}
bootstrap();
