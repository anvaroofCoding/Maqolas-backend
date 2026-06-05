import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateArticleRequestNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  authorNote?: string;
}
