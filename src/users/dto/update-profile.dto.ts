import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UpdateSocialLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkedin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  telegram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  instagram?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSocialLinksDto)
  social?: UpdateSocialLinksDto;
}
