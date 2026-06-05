import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListMyArticlesDto {
  @IsOptional()
  @IsEnum(['draft', 'review', 'published', 'rejected'])
  status?: 'draft' | 'review' | 'published' | 'rejected';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
