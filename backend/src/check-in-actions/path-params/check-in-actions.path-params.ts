import { IsUUID } from 'class-validator';

export class CheckInActionsPathParams {
  @IsUUID()
  checkInId: string;
}

export class CheckInActionPathParams {
  @IsUUID()
  actionId: string;
}
