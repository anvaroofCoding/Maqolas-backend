import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BAN_UNITS, type BanUnit } from '../schemas/ban.schema';

export class CreateBanDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationAmount?: number;

  @IsEnum(BAN_UNITS)
  durationUnit!: BanUnit;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}
