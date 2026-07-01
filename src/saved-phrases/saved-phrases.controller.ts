import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { CreateSavedPhraseDto } from './dto/create-saved-phrase.dto';
import { ListSavedPhrasesDto } from './dto/list-saved-phrases.dto';
import { SavedPhrasesService } from './saved-phrases.service';

@Controller('saved-phrases')
@UseGuards(JwtAuthGuard)
export class SavedPhrasesController {
  constructor(private readonly savedPhrasesService: SavedPhrasesService) {}

  @Post()
  create(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateSavedPhraseDto,
  ) {
    return this.savedPhrasesService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: UserDocument,
    @Query() query: ListSavedPhrasesDto,
  ) {
    return this.savedPhrasesService.findAll(user.id, query);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.savedPhrasesService.remove(user.id, id);
  }
}
