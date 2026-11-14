import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';
import { CheckInDateRangeValidator } from './check-in-date-range.validator.js';

export class ListCheckInsQueryParams {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  limit?: number;

  @ValidateIf(
    (query: ListCheckInsQueryParams) =>
      query.from !== undefined || query.to !== undefined,
  )
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/, {
    message: 'from must use YYYY-MM-DD format',
  })
  from?: string;

  @ValidateIf(
    (query: ListCheckInsQueryParams) =>
      query.from !== undefined || query.to !== undefined,
  )
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/, {
    message: 'to must use YYYY-MM-DD format',
  })
  @Validate(CheckInDateRangeValidator)
  to?: string;
}
