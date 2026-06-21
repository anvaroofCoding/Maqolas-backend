import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendAdminEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;

  @IsIn(['all', 'selected'])
  recipientMode!: 'all' | 'selected';

  @ValidateIf((dto: SendAdminEmailDto) => dto.recipientMode === 'selected')
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  @IsOptional()
  userIds?: string[];
}
