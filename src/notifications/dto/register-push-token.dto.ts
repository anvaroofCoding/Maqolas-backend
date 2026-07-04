import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PUSH_PLATFORMS } from '../schemas/push-token.schema';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsIn(PUSH_PLATFORMS)
  platform!: (typeof PUSH_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class RemovePushTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
