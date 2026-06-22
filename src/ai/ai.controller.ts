import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { AiService } from './ai.service';
import { CompleteDto } from './dto/complete.dto';
import { ProofreadDto } from './dto/proofread.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('complete')
  async complete(@Body() body: CompleteDto, @CurrentUser() user: UserDocument) {
    return this.aiService.complete(body.text, user.id);
  }

  @Post('proofread')
  async proofread(@Body() body: ProofreadDto) {
    return this.aiService.proofread(body.text);
  }
}
