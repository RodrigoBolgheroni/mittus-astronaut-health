import type { Prisma } from '../../generated/prisma/client.js';

export interface GeneratedRecommendation {
  insight: {
    title: string;
    summary: string;
    next_step: string;
    facts: Prisma.InputJsonObject;
    source: 'ai' | 'fallback';
    generator: string | null;
  };
  tasks: {
    task_key: string;
    title: string;
    source: 'check_in' | 'forecast';
    kind: 'task' | 'review_insight';
    action_code: 'monitor' | 'recheck' | 'contact_crew' | 'contact_medical';
    reason_code: string;
    ruleset_version: string;
  }[];
}
