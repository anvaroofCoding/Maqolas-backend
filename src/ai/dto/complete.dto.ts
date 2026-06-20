import { IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  text!: string;
}
