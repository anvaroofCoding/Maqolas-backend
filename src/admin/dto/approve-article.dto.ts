import { ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

export class ApproveArticleDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  categoryIds!: string[];
}
