import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class BatchCommentIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  commentIds!: string[];
}

export class RejectCommentsDto extends BatchCommentIdsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
