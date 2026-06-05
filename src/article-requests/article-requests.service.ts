import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { CreateArticleRequestDto } from './dto/create-article-request.dto';
import { ListAllArticleRequestsDto } from './dto/list-all-article-requests.dto';
import { ListArticleRequestsDto } from './dto/list-article-requests.dto';
import { UpdateArticleRequestNoteDto } from './dto/update-article-request-note.dto';
import {
  ArticleRequest,
  ArticleRequestDocument,
} from './schemas/article-request.schema';
import {
  ArticleRequestLike,
  ArticleRequestLikeDocument,
} from './schemas/article-request-like.schema';

@Injectable()
export class ArticleRequestsService {
  constructor(
    @InjectModel(ArticleRequest.name)
    private readonly requestModel: Model<ArticleRequestDocument>,
    @InjectModel(ArticleRequestLike.name)
    private readonly likeModel: Model<ArticleRequestLikeDocument>,
    private readonly usersService: UsersService,
  ) {}

  async listTrending(limit = 5, viewerId?: string) {
    const requests = await this.requestModel
      .find({ status: { $ne: 'fulfilled' } })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(limit)
      .populate('requesterId', 'displayName username avatarUrl')
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    const likedIds = viewerId
      ? await this.getLikedRequestIds(
          requests.map((request) => String(request._id)),
          viewerId,
        )
      : new Set<string>();

    return {
      requests: requests.map((request) =>
        this.toPublicRequest(request, likedIds.has(String(request._id)), true),
      ),
    };
  }

  async listAll(query: ListAllArticleRequestsDto, viewerId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.requestModel
        .find({ status: { $ne: 'fulfilled' } })
        .sort({ likeCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requesterId', 'displayName username avatarUrl')
        .populate('authorId', 'displayName username avatarUrl')
        .exec(),
      this.requestModel
        .countDocuments({ status: { $ne: 'fulfilled' } })
        .exec(),
    ]);

    const likedIds = viewerId
      ? await this.getLikedRequestIds(
          requests.map((request) => String(request._id)),
          viewerId,
        )
      : new Set<string>();

    return {
      requests: requests.map((request) =>
        this.toPublicRequest(request, likedIds.has(String(request._id)), true),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async listByAuthor(query: ListArticleRequestsDto, viewerId?: string) {
    const author = await this.usersService.findByUsername(query.author);
    if (!author) {
      throw new NotFoundException('Muallif topilmadi');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter = { authorId: author._id };

    const [requests, total] = await Promise.all([
      this.requestModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requesterId', 'displayName username avatarUrl')
        .exec(),
      this.requestModel.countDocuments(filter).exec(),
    ]);

    const likedIds = viewerId
      ? await this.getLikedRequestIds(
          requests.map((request) => String(request._id)),
          viewerId,
        )
      : new Set<string>();

    return {
      requests: requests.map((request) =>
        this.toPublicRequest(request, likedIds.has(String(request._id))),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async create(requesterId: string, dto: CreateArticleRequestDto) {
    const authorUsername = dto.authorUsername?.trim().toLowerCase();
    let authorId: Types.ObjectId | undefined;

    if (authorUsername) {
      const author = await this.usersService.findByUsername(authorUsername);
      if (!author) {
        throw new NotFoundException('Muallif topilmadi');
      }

      if (String(author._id) === requesterId) {
        throw new BadRequestException(
          "O'zingizga maqola so'ray olmaysiz",
        );
      }

      authorId = author._id;
    }

    const request = await this.requestModel.create({
      ...(authorId ? { authorId } : {}),
      requesterId,
      title: dto.title.trim(),
      description: dto.description.trim(),
      status: 'new',
      likeCount: 0,
    });

    await request.populate('requesterId', 'displayName username avatarUrl');

    return {
      request: this.toPublicRequest(request, false),
    };
  }

  async toggleLike(requestId: string, userId: string) {
    const request = await this.findRequestById(requestId);
    const existing = await this.likeModel
      .findOne({ requestId: request._id, userId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      request.likeCount = Math.max(0, (request.likeCount ?? 0) - 1);
      await request.save();
      return { liked: false, likeCount: request.likeCount };
    }

    await this.likeModel.create({ requestId: request._id, userId });
    request.likeCount = (request.likeCount ?? 0) + 1;
    await request.save();
    return { liked: true, likeCount: request.likeCount };
  }

  async updateAuthorNote(
    requestId: string,
    authorId: string,
    dto: UpdateArticleRequestNoteDto,
  ) {
    const request = await this.findRequestById(requestId);

    if (!request.authorId || String(request.authorId) !== authorId) {
      throw new ForbiddenException('Faqat muallif izoh qoldira oladi');
    }

    const note = dto.authorNote?.trim() ?? '';
    request.authorNote = note || undefined;

    if (note && request.status === 'new') {
      request.status = 'in_progress';
    }

    if (!note && request.status === 'in_progress') {
      request.status = 'new';
    }

    await request.save();
    await request.populate('requesterId', 'displayName username avatarUrl');

    return {
      request: this.toPublicRequest(request, false),
    };
  }

  private async findRequestById(requestId: string) {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new NotFoundException('So\'ralgan maqola topilmadi');
    }

    const request = await this.requestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('So\'ralgan maqola topilmadi');
    }

    return request;
  }

  private async getLikedRequestIds(requestIds: string[], userId: string) {
    if (requestIds.length === 0) {
      return new Set<string>();
    }

    const likes = await this.likeModel
      .find({
        requestId: { $in: requestIds },
        userId,
      })
      .select('requestId')
      .lean()
      .exec();

    return new Set(likes.map((like) => String(like.requestId)));
  }

  private toPublicRequest(
    request: ArticleRequestDocument,
    likedByMe = false,
    includeAuthor = false,
  ) {
    const json = request.toJSON() as Record<string, unknown>;
    const requester = request.requesterId as
      | { displayName?: string; username?: string; avatarUrl?: string }
      | undefined;
    const author = request.authorId as
      | { displayName?: string; username?: string; avatarUrl?: string }
      | undefined;

    if (requester && typeof requester === 'object' && 'username' in requester) {
      json.requester = {
        id: String((requester as { _id?: unknown })._id ?? request.requesterId),
        displayName: requester.displayName,
        username: requester.username,
        avatarUrl: requester.avatarUrl,
      };
    }

    if (includeAuthor && author && typeof author === 'object' && 'username' in author) {
      json.author = {
        id: String((author as { _id?: unknown })._id ?? request.authorId),
        displayName: author.displayName,
        username: author.username,
        avatarUrl: author.avatarUrl,
      };
    }

    json.likedByMe = likedByMe;
    delete json.authorId;
    delete json.requesterId;

    return json;
  }
}
