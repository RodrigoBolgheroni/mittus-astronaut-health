import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PutCheckInRequest {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  sleep_hours: number;

  @IsInt()
  @Min(1)
  @Max(5)
  stress_level: number;

  @IsInt()
  @Min(1)
  @Max(5)
  mood_level: number;

  @IsInt()
  @Min(1)
  @Max(5)
  team_conflict_level: number;

  @IsInt()
  @Min(1)
  @Max(7)
  fatigue: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
