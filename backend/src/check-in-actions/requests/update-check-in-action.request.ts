import { IsIn } from 'class-validator';

export class UpdateCheckInActionRequest {
  @IsIn(['acknowledged', 'completed', 'dismissed'])
  status: 'acknowledged' | 'completed' | 'dismissed';
}
