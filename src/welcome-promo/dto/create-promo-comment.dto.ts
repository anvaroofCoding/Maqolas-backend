import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePromoCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;
}
