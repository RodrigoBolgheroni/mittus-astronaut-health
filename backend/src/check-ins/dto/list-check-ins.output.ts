import type { CheckInOutput } from './check-in.output.js';

export interface ListCheckInsOutput {
  items: CheckInOutput[];
  today: string;
  timezone: 'UTC';
}
