import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSavedPhraseDto {
  @IsMongoId()
  articleId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  text!: string;
}
