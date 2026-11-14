import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvironment, RuntimeConfig } from './config.js';
import { setupApp } from './setup.js';

async function bootstrap() {
  loadEnvironment();
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get(RuntimeConfig).port);
}
await bootstrap();
