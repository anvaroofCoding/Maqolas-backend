import { ArrayMinSize, IsArray, IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class ApproveArticleDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  categoryIds!: string[];

  /** true bo'lsa barcha foydalanuvchilarga yangi maqola haqida email yuboriladi */
  @IsOptional()
  @IsBoolean()
  sendEmailNotification?: boolean;
}
