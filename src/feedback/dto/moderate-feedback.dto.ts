import { ArrayMinSize, IsArray, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class BatchFeedbackIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  feedbackIds!: string[];
}

export class RejectFeedbackDto extends BatchFeedbackIdsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
