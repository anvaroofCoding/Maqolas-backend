import { IsString, MaxLength } from 'class-validator';
import { MaxWords, MinWords } from '../validators/max-words.validator';

export const MIN_PROMPT_WORDS = 50;
export const MAX_PROMPT_WORDS = 1000;

export class GenerateArticleDto {
  @IsString()
  @MinWords(MIN_PROMPT_WORDS, {
    message: `Maqola talabini kamida ${MIN_PROMPT_WORDS} ta so'zdan yozing`,
  })
  @MaxLength(15000)
  @MaxWords(MAX_PROMPT_WORDS, {
    message: `Maqola talabi ${MAX_PROMPT_WORDS} ta so'zdan oshmasligi kerak`,
  })
  prompt!: string;
}
