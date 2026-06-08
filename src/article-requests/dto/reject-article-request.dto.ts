import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectArticleRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
