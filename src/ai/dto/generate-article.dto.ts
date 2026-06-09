import { IsString, MaxLength, MinLength } from 'class-validator';
import { MaxWords } from '../validators/max-words.validator';

export const MAX_PROMPT_WORDS = 1000;

export class GenerateArticleDto {
  @IsString()
  @MinLength(20, {
    message: 'Maqola talabini kamida 20 ta belgidan yozing',
  })
  @MaxLength(15000)
  @MaxWords(MAX_PROMPT_WORDS, {
    message: `Maqola talabi ${MAX_PROMPT_WORDS} ta so'zdan oshmasligi kerak`,
  })
  prompt!: string;
}
