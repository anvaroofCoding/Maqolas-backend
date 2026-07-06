import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { AiChatService } from './ai-chat.service';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { CompleteDto } from './dto/complete.dto';
import { CreateChatThreadDto } from './dto/create-chat-thread.dto';
import { ProofreadDto } from './dto/proofread.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiChatService: AiChatService,
  ) {}

  @Get('chat/quota')
  async getChatQuota(@CurrentUser() user: UserDocument) {
    return this.aiChatService.getQuota(user.id);
  }

  @Post('chat/threads')
  async createChatThread(
    @CurrentUser() user: UserDocument,
    @Body() body: CreateChatThreadDto,
  ) {
    return this.aiChatService.createThread(user.id, body);
  }

  @Post('chat')
  async chat(@Body() body: ChatDto) {
    return this.aiService.chat(body.message, body.history ?? []);
  }

  @Post('complete')
  async complete(@Body() body: CompleteDto, @CurrentUser() user: UserDocument) {
    return this.aiService.complete(body.text, user.id);
  }

  @Post('proofread')
  async proofread(@Body() body: ProofreadDto) {
    return this.aiService.proofread(body.text);
  }
}
