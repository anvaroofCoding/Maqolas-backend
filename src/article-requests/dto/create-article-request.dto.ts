import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateArticleRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  authorUsername?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description!: string;
}
