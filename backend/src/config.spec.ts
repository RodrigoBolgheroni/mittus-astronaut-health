import { RuntimeConfig } from './config.js';

describe('Runtime configuration', () => {
  beforeEach(() => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/mittus_test',
    );
    vi.stubEnv('SESSION_SECRET', 'a-secret-with-at-least-32-characters');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('PORT', '3001');
    vi.stubEnv('FATIGUE_FORECAST_URL', undefined);
    vi.stubEnv('CERES_URL', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('fails early when the signing secret is missing or weak', () => {
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => new RuntimeConfig()).toThrow('SESSION_SECRET');
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(() => new RuntimeConfig()).toThrow('SESSION_SECRET');
  });

  it.each([
    '*',
    'null',
    'http://localhost:3000/path',
    'http://localhost:3000/',
  ])('rejects an invalid web origin: %s', (origin) => {
    vi.stubEnv('WEB_ORIGIN', origin);
    expect(() => new RuntimeConfig()).toThrow('WEB_ORIGIN');
  });

  it('rejects malformed database URLs without exposing the supplied value', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://private-password');
    expect(() => new RuntimeConfig()).toThrow(
      'DATABASE_URL must be a PostgreSQL connection URL.',
    );
  });

  it('leaves the optional forecast endpoint unconfigured by default', () => {
    expect(new RuntimeConfig().fatigueForecastUrl).toBeUndefined();
  });

  it.each([
    'http://localhost:8080/predict',
    'https://forecast.example/predict?v=1',
  ])('accepts a forecast endpoint: %s', (url) => {
    vi.stubEnv('FATIGUE_FORECAST_URL', url);
    expect(new RuntimeConfig().fatigueForecastUrl).toBe(url);
  });

  it.each([
    '',
    'not-a-url',
    'ftp://forecast.example/predict',
    'https://user:secret@forecast.example/predict',
    'https://forecast.example/predict#secret',
    'https://forecast.example/predict#',
  ])('rejects an invalid forecast endpoint without exposing it: %s', (url) => {
    vi.stubEnv('FATIGUE_FORECAST_URL', url);
    expect(() => new RuntimeConfig()).toThrow(
      'FATIGUE_FORECAST_URL must be an HTTP URL without credentials or a fragment.',
    );
  });

  it('leaves the optional recommendation provider unconfigured by default', () => {
    expect(new RuntimeConfig().ceresUrl).toBeUndefined();
  });

  it.each([
    ['http://localhost:8081', 'http://localhost:8081'],
    ['https://ceres.example/', 'https://ceres.example'],
    ['https://ceres.example/api///', 'https://ceres.example/api'],
    ['https://ceres.example/api/?v=1', 'https://ceres.example/api?v=1'],
  ])('normalizes the Ceres base URL: %s', (url, expected) => {
    vi.stubEnv('CERES_URL', url);
    expect(new RuntimeConfig().ceresUrl).toBe(expected);
  });

  it.each([
    '',
    'not-a-url',
    'ftp://ceres.example',
    'https://user:secret@ceres.example',
    'https://ceres.example#secret',
    'https://ceres.example#',
  ])('rejects an invalid Ceres URL without exposing it: %s', (url) => {
    vi.stubEnv('CERES_URL', url);
    expect(() => new RuntimeConfig()).toThrow(
      'CERES_URL must be an HTTP URL without credentials or a fragment.',
    );
  });

  it('marks production sessions as secure', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(new RuntimeConfig().production).toBe(true);
  });
});
