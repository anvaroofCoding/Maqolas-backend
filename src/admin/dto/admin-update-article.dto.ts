import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminUpdateArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsString()
  contentHtml!: string;

  @IsOptional()
  @IsObject()
  contentJson?: Record<string, unknown>;
}
