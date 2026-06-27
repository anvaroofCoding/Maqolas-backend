import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePinCommentDto {
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
