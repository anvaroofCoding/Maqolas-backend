import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectArticleDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
