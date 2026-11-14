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

  it('marks production sessions as secure', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(new RuntimeConfig().production).toBe(true);
  });
});
