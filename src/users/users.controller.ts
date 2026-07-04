import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { ArticlesService } from '../articles/articles.service';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { UserDocument } from './schemas/user.schema';
import { ListFollowersDto } from './dto/list-followers.dto';
import { FollowsService } from './follows.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly followsService: FollowsService,
    @Inject(forwardRef(() => ArticlesService))
    private readonly articlesService: ArticlesService,
  ) {}

  @Get('sitemap')
  async getSitemap() {
    const entries =
      await this.articlesService.listPublishedAuthorProfilesForSitemap();
    return { entries };
  }

  @Get('platform-stats')
  async getPlatformStats() {
    return this.usersService.getPlatformPublicStats();
  }

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  async getPublicProfile(
    @Param('username') username: string,
    @OptionalCurrentUser() viewer: UserDocument | null,
  ) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const [articlesCount, followersCount, followingCount, isFollowing] =
      await Promise.all([
      this.articlesService.countPublishedByAuthor(user.id),
      this.followsService.countFollowers(user.id),
      this.followsService.countFollowing(user.id),
      viewer
        ? this.followsService.isFollowing(viewer.id, user.id)
        : Promise.resolve(false),
    ]);

    return {
      user: this.usersService.toPublicProfile(user),
      stats: { articlesCount, followersCount, followingCount },
      isFollowing,
    };
  }

  @Get(':username/articles')
  async getPublicArticles(
    @Param('username') username: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    return this.articlesService.findPublishedByAuthorId(
      user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':username/followers')
  async getFollowers(
    @Param('username') username: string,
    @Query() query: ListFollowersDto,
  ) {
    return this.followsService.getFollowers(username, query);
  }

  @Get(':username/following')
  async getFollowing(
    @Param('username') username: string,
    @Query() query: ListFollowersDto,
  ) {
    return this.followsService.getFollowing(username, query);
  }

  @Post(':username/follow')
  @UseGuards(JwtAuthGuard)
  async toggleFollow(
    @CurrentUser() user: UserDocument,
    @Param('username') username: string,
  ) {
    return this.followsService.toggleFollow(user.id, username);
  }
}
