import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChatThreadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn(['chat', 'article'])
  mode?: 'chat' | 'article';
}
