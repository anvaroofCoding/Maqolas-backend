import { IsBoolean } from 'class-validator';

export class PinArticleDto {
  @IsBoolean()
  isPinned!: boolean;
}
