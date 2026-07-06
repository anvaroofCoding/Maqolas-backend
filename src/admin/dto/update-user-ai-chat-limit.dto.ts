import { IsInt, Max, Min } from 'class-validator';

export class UpdateUserAiChatLimitDto {
  @IsInt()
  @Min(0)
  @Max(100)
  aiChatDailyLimit!: number;
}
