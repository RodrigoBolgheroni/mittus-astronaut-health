import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeConfig } from '../config.js';
import { ForecastService } from './forecast.service.js';
import type { ForecastCheckIn } from './dto/forecast-check-in.js';

const history: ForecastCheckIn[] = [
  {
    id: 'check-in-id',
    check_in_date: '2026-11-14',
    sleep_hours: 7,
    stress_level: 2,
    mood_level: 3,
    team_conflict_level: 1,
    fatigue: 2,
  },
];
const ready = {
  status: 'ready',
  probability_high_fatigue: 0.6,
  model_version: 'model-v1',
  predicted_at: '2026-11-14T12:30:00.000Z',
};

function service(url: string | undefined = 'https://forecast.example/predict') {
  vi.stubEnv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/mittus_test',
  );
  vi.stubEnv('SESSION_SECRET', 'a-secret-with-at-least-32-characters');
  vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('PORT', '3001');
  vi.stubEnv('FATIGUE_FORECAST_URL', url);
  return new ForecastService(new RuntimeConfig());
}

describe('ForecastService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts chronological model inputs without private or extra fields', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(ready));
    vi.stubGlobal('fetch', fetch);
    const privateCheckIn = {
      ...history[0]!,
      session_id: 'private',
      description: 'private',
    };
    const older = { ...history[0]!, check_in_date: '2026-11-13' };
    expect(await service().predict([privateCheckIn, older])).toEqual(ready);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe('https://forecast.example/predict');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual({
      check_ins: [older, history[0]],
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not call a model when no endpoint is configured', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    service();
    vi.stubEnv('FATIGUE_FORECAST_URL', undefined);
    expect(
      await new ForecastService(new RuntimeConfig()).predict(history),
    ).toEqual({ status: 'unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts insufficient history from the real provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ status: 'insufficient_history' })),
    );
    expect(await service().predict(history)).toEqual({
      status: 'insufficient_history',
    });
  });

  it.each([0, 1])(
    'accepts boundary probability %s and trims model versions',
    async (probability) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({
              ...ready,
              probability_high_fatigue: probability,
              model_version: ' model-v1 ',
            }),
          ),
      );
      expect(await service().predict(history)).toEqual({
        ...ready,
        probability_high_fatigue: probability,
      });
    },
  );

  it.each([
    null,
    [],
    {},
    { ...ready, probability_high_fatigue: -0.1 },
    { ...ready, probability_high_fatigue: 1.1 },
    { ...ready, probability_high_fatigue: '0.5' },
    { ...ready, model_version: ' ' },
    { ...ready, model_version: 'x'.repeat(129) },
    { ...ready, predicted_at: '2026-02-30T12:30:00.000Z' },
    { ...ready, predicted_at: '2026-11-14T12:30:00+00:00' },
    { ...ready, predicted_at: 'not-a-date' },
  ])('rejects malformed provider results: %j', async (result) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
    expect(await service().predict(history)).toEqual({ status: 'unavailable' });
  });

  it('reports HTTP failures as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private error', { status: 503 })),
    );
    expect(await service().predict(history)).toEqual({ status: 'unavailable' });
  });

  it('reports invalid JSON as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json')));
    expect(await service().predict(history)).toEqual({ status: 'unavailable' });
  });

  it('reports network errors as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private provider error')),
    );
    expect(await service().predict(history)).toEqual({ status: 'unavailable' });
  });

  it('aborts a request after five seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, request: RequestInit) => {
        await delay(10000, undefined, { signal: request.signal ?? undefined });
        return Response.json(ready);
      }),
    );
    const result = service().predict(history);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ status: 'unavailable' });
  });
});
