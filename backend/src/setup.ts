import type { INestApplication } from '@nestjs/common';
import { RuntimeConfig } from './config.js';
import { Clock } from './common/clock.js';
import { sessionMiddleware } from './session/session.middleware.js';

export function setupApp(app: INestApplication) {
  const config = app.get(RuntimeConfig);
  app.setGlobalPrefix('api');
  app.use(sessionMiddleware(config, app.get(Clock)));
  app.enableCors({ origin: config.webOrigin, credentials: true });
}
