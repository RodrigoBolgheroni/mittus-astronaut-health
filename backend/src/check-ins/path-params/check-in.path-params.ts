import { IsDateString, Matches } from 'class-validator';

export class CheckInPathParams {
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD format',
  })
  date: string;
}
