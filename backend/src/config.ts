import { Injectable } from '@nestjs/common';

// Load before constructing Prisma. Never replace environment values supplied by deployment.
export function loadEnvironment() {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Compatibility with the original local configuration.
  if (!process.env.DATABASE_URL && process.env.DATASOURCE_URL) {
    process.env.DATABASE_URL = process.env.DATASOURCE_URL;
  }
}

@Injectable()
export class RuntimeConfig {
  readonly databaseUrl: string;
  readonly sessionSecret: string;
  readonly webOrigin: string;
  readonly production: boolean;
  readonly port: number;
  readonly fatigueForecastUrl: string | undefined;
  readonly ceresUrl: string | undefined;

  constructor() {
    const { DATABASE_URL, SESSION_SECRET, WEB_ORIGIN } = process.env;
    if (!DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(DATABASE_URL)) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
    }
    try {
      const database = new URL(DATABASE_URL);
      if (!database.hostname || database.pathname.length <= 1)
        throw new Error();
    } catch {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
    }
    if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
      throw new Error('SESSION_SECRET must contain at least 32 characters.');
    }
    let origin: URL;
    try {
      origin = new URL(WEB_ORIGIN ?? '');
    } catch {
      throw new Error('WEB_ORIGIN must be an HTTP origin.');
    }
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.origin !== WEB_ORIGIN
    ) {
      throw new Error('WEB_ORIGIN must be an HTTP origin without a path.');
    }
    const forecastUrl = process.env.FATIGUE_FORECAST_URL;
    if (forecastUrl !== undefined) {
      try {
        const parsed = new URL(forecastUrl);
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          !parsed.hostname ||
          parsed.username ||
          parsed.password ||
          parsed.hash ||
          forecastUrl.includes('#')
        ) {
          throw new Error();
        }
      } catch {
        throw new Error(
          'FATIGUE_FORECAST_URL must be an HTTP URL without credentials or a fragment.',
        );
      }
    }
    let ceresUrl: string | undefined;
    if (process.env.CERES_URL !== undefined) {
      try {
        const parsed = new URL(process.env.CERES_URL);
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          !parsed.hostname ||
          parsed.username ||
          parsed.password ||
          parsed.hash ||
          process.env.CERES_URL.includes('#')
        ) {
          throw new Error();
        }
        ceresUrl =
          parsed.origin + parsed.pathname.replace(/\/+$/, '') + parsed.search;
      } catch {
        throw new Error(
          'CERES_URL must be an HTTP URL without credentials or a fragment.',
        );
      }
    }
    const port = Number(process.env.PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535.');
    }
    this.databaseUrl = DATABASE_URL;
    this.sessionSecret = SESSION_SECRET;
    this.webOrigin = origin.origin;
    this.production = process.env.NODE_ENV === 'production';
    this.port = port;
    this.fatigueForecastUrl = forecastUrl;
    this.ceresUrl = ceresUrl;
  }
}
