import { once } from 'node:events';
import { RuntimeConfig } from '../config.js';
import type { ForecastCheckIn } from '../forecast/dto/forecast-check-in.js';
import type { ForecastResult } from '../forecast/dto/forecast-result.js';
import { CeresService } from './ceres.service.js';
import type { GeneratedRecommendation } from './dto/recommendation.output.js';

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
const forecast: ForecastResult = {
  status: 'ready',
  probability_high_fatigue: 0.6,
  model_version: 'model-v1',
  predicted_at: '2026-11-14T12:30:00.000Z',
};
const recommendation: GeneratedRecommendation = {
  insight: {
    title: 'Provider title',
    summary: 'Provider summary',
    next_step: 'Provider next step',
    facts: { sample_count: 1, recorded: [7, null, true, { value: 'recorded' }] },
    source: 'ai',
    generator: 'ceres-test-v1',
  },
  tasks: [
    {
      task_key: 'check_in_review',
      title: 'Provider task',
      source: 'check_in',
      kind: 'review_insight',
      action_code: 'monitor',
      reason_code: 'provider_reason',
      ruleset_version: 'provider-v1',
    },
  ],
};

function service() {
  return new CeresService(new RuntimeConfig());
}

function mockResponse(value: unknown) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(value),
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('CeresService', () => {
  beforeEach(() => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/mittus_test',
    );
    vi.stubEnv('SESSION_SECRET', 'a-secret-with-at-least-32-characters');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('PORT', '3001');
    vi.stubEnv('FATIGUE_FORECAST_URL', undefined);
    vi.stubEnv('CERES_URL', 'https://ceres.example/api/');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns null without network access when the provider is unconfigured', async () => {
    vi.stubEnv('CERES_URL', undefined);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await service().generate(history, forecast)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends only the latest 90 chronological canonical entries and forecast', async () => {
    const fetch = mockResponse(recommendation);
    const entries = Array.from({ length: 95 }, (_, index) => ({
      ...history[0]!,
      id: `check-in-${index}`,
      check_in_date: new Date(Date.UTC(2026, 7, index + 1))
        .toISOString()
        .slice(0, 10),
      session_id: 'private-session',
      description: 'private-description',
      cookies: 'private-cookie',
    })).reverse();
    const originalIds = entries.map((entry) => entry.id);
    const privateForecast = {
      ...forecast,
      session_id: 'private-session',
      description: 'private-description',
      cookies: 'private-cookie',
    };
    expect(await service().generate(entries, privateForecast)).toEqual(
      recommendation,
    );
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe('https://ceres.example/api/v1/recommendations');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request).not.toHaveProperty('credentials');
    const body = JSON.parse(request.body);
    expect(body.forecast).toEqual(forecast);
    expect(body.check_ins).toHaveLength(90);
    expect(body.check_ins.map((entry: ForecastCheckIn) => entry.id)).toEqual(
      Array.from({ length: 90 }, (_, index) => `check-in-${index + 5}`),
    );
    expect(Object.keys(body.check_ins[0]).sort()).toEqual([
      'check_in_date',
      'fatigue',
      'id',
      'mood_level',
      'sleep_hours',
      'stress_level',
      'team_conflict_level',
    ]);
    expect(body.check_ins[0]).toMatchObject({
      sleep_hours: 7,
      stress_level: 2,
      mood_level: 3,
      team_conflict_level: 1,
      fatigue: 2,
    });
    expect(request.body).not.toContain('private-');
    expect(entries.map((entry) => entry.id)).toEqual(originalIds);
  });

  it('preserves canonical forecast probabilities at both finite boundaries', async () => {
    const fetch = mockResponse(recommendation);
    for (const probability of [0, 1]) {
      const canonical = { ...forecast, probability_high_fatigue: probability };
      expect(await service().generate(history, canonical)).toEqual(recommendation);
      const request = fetch.mock.lastCall![1];
      expect(JSON.parse(request.body).forecast).toEqual(canonical);
    }
  });

  it('appends the endpoint to the base path and preserves configured query parameters', async () => {
    vi.stubEnv('CERES_URL', 'https://ceres.example/api///?v=1');
    const fetch = mockResponse(recommendation);
    await service().generate(history, forecast);
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://ceres.example/api/v1/recommendations?v=1',
    );
  });

  it('accepts a labeled fallback only with a null generator', async () => {
    const fallback = {
      ...recommendation,
      insight: { ...recommendation.insight, source: 'fallback', generator: null },
    };
    mockResponse(fallback);
    expect(await service().generate(history, forecast)).toEqual(fallback);
  });

  it.each(['monitor', 'recheck', 'contact_crew', 'contact_medical'])(
    'accepts the database action code %s without adding clinical rules',
    async (actionCode) => {
      const value = {
        ...recommendation,
        tasks: [
          {
            ...recommendation.tasks[0]!,
            source: 'forecast',
            kind: 'task',
            action_code: actionCode,
          },
        ],
      };
      mockResponse(value);
      expect(await service().generate(history, forecast)).toEqual(value);
    },
  );

  it.each(['insufficient_history', 'unavailable'] as const)(
    'rejects forecast tasks when the canonical forecast is %s',
    async (status) => {
      mockResponse({
        ...recommendation,
        forecast: { ...forecast, status: 'ready' },
        tasks: [{ ...recommendation.tasks[0]!, source: 'forecast' }],
      });
      expect(await service().generate(history, { status })).toBeNull();
    },
  );

  it.each(['insufficient_history', 'unavailable'] as const)(
    'accepts check-in tasks when the forecast is %s',
    async (status) => {
      const fetch = mockResponse(recommendation);
      expect(await service().generate(history, { status })).toEqual(
        recommendation,
      );
      expect(JSON.parse(fetch.mock.calls[0]![1].body).forecast).toEqual({ status });
    },
  );

  it('ignores all provider-supplied statuses, snapshots and extra output fields', async () => {
    mockResponse({
      ...recommendation,
      status: 'complete',
      forecast: { status: 'unavailable' },
      insight: { ...recommendation.insight, status: 'resolved', id: 'provider-id' },
      tasks: [
        {
          ...recommendation.tasks[0]!,
          status: 'resolved',
          forecast_snapshot: { probability_high_fatigue: 999 },
          id: 'provider-task-id',
        },
      ],
    });
    expect(await service().generate(history, forecast)).toEqual(recommendation);
  });

  it('trims nonempty provider text without inventing content', async () => {
    mockResponse({
      ...recommendation,
      insight: {
        ...recommendation.insight,
        title: '  Provider title  ',
        summary: '\nProvider summary\n',
        next_step: ' Provider next step ',
        generator: ' ceres-test-v1 ',
      },
      tasks: [
        {
          ...recommendation.tasks[0]!,
          title: ' Provider task ',
          reason_code: ' provider_reason ',
          ruleset_version: ' provider-v1 ',
        },
      ],
    });
    expect(await service().generate(history, forecast)).toEqual(recommendation);
  });

  it.each([null, [], {}, { insight: null }, { insight: recommendation.insight }])(
    'rejects a malformed response envelope: %j',
    async (value) => {
      mockResponse(value);
      expect(await service().generate(history, forecast)).toBeNull();
    },
  );

  it.each([
    { title: '' },
    { title: 42 },
    { summary: '   ' },
    { next_step: null },
    { next_step: '' },
    { facts: null },
    { facts: [] },
    { facts: 'not an object' },
    { facts: { nested: { value: Number.POSITIVE_INFINITY } } },
    { facts: { nested: [undefined] } },
    { source: 'system' },
    { source: 'ai', generator: null },
    { source: 'ai', generator: '   ' },
    { source: 'ai', generator: 42 },
    { source: 'fallback', generator: 'ceres-test-v1' },
    { source: 'fallback', generator: undefined },
  ])('rejects invalid insight fields: %j', async (fields) => {
    mockResponse({
      ...recommendation,
      insight: { ...recommendation.insight, ...fields },
    });
    expect(await service().generate(history, forecast)).toBeNull();
  });

  it.each([
    null,
    'task',
    { task_key: '' },
    { task_key: 'invalid key' },
    { task_key: '../invalid' },
    { task_key: 'A' },
    { task_key: 'invalid-key' },
    { title: '' },
    { title: false },
    { source: 'system' },
    { kind: 'advice' },
    { action_code: 'escalate' },
    { reason_code: '' },
    { reason_code: 42 },
    { ruleset_version: '  ' },
    { ruleset_version: null },
  ])('rejects malformed tasks and invalid enums: %j', async (fields) => {
    mockResponse({
      ...recommendation,
      tasks: [
        typeof fields === 'object' && fields !== null
          ? { ...recommendation.tasks[0]!, ...fields }
          : fields,
      ],
    });
    expect(await service().generate(history, forecast)).toBeNull();
  });

  it.each([null, {}, [], [recommendation.tasks[0], recommendation.tasks[0]]])(
    'rejects missing, empty or duplicate task sets: %j',
    async (tasks) => {
      mockResponse({ ...recommendation, tasks });
      expect(await service().generate(history, forecast)).toBeNull();
    },
  );

  it.each(['_', '0', 'a'.repeat(65)])(
    'accepts task keys matching the database constraint: %s',
    async (taskKey) => {
      const value = {
        ...recommendation,
        tasks: [{ ...recommendation.tasks[0]!, task_key: taskKey }],
      };
      mockResponse(value);
      expect(await service().generate(history, forecast)).toEqual(value);
    },
  );

  it('accepts exactly 90 unique tasks and rejects larger plans', async () => {
    const tasks = Array.from({ length: 90 }, (_, index) => ({
      ...recommendation.tasks[0]!,
      task_key: `task_${index}`,
    }));
    mockResponse({ ...recommendation, tasks });
    expect(await service().generate(history, forecast)).toEqual({
      ...recommendation,
      tasks,
    });
    mockResponse({
      ...recommendation,
      tasks: [...tasks, { ...tasks[0]!, task_key: 'task_90' }],
    });
    expect(await service().generate(history, forecast)).toBeNull();
  });

  it('returns null for HTTP errors without parsing or retrying', async () => {
    const json = vi.fn();
    const fetch = vi.fn().mockResolvedValue({ ok: false, json });
    vi.stubGlobal('fetch', fetch);
    expect(await service().generate(history, forecast)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
  });

  it('returns null for malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON')),
      }),
    );
    expect(await service().generate(history, forecast)).toBeNull();
  });

  it('returns null for network or redirect failures without retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Fetch failed'));
    vi.stubGlobal('fetch', fetch);
    expect(await service().generate(history, forecast)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1].redirect).toBe('error');
  });

  it('aborts after exactly 60 seconds and does not retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async (_url: string, request: RequestInit) => {
      await once(request.signal!, 'abort');
      throw new DOMException('Aborted', 'AbortError');
    });
    vi.stubGlobal('fetch', fetch);
    const result = service().generate(history, forecast);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetch.mock.calls[0]![1].signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBeNull();
    expect(fetch.mock.calls[0]![1].signal!.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the timeout active until the response body has been read', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, request: RequestInit) => ({
        ok: true,
        json: async () => {
          await once(request.signal!, 'abort');
          throw new DOMException('Aborted', 'AbortError');
        },
      })),
    );
    const result = service().generate(history, forecast);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await result).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the request timer after success and immediate failure', async () => {
    vi.useFakeTimers();
    mockResponse(recommendation);
    expect(await service().generate(history, forecast)).toEqual(recommendation);
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    expect(await service().generate(history, forecast)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
