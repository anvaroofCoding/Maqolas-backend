import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import { Category, CategoryDocument } from './schemas/category.schema';

const DEFAULT_CATEGORIES = [
  { name: 'Texnologiya', slug: 'texnologiya', sortOrder: 1 },
  { name: 'Startaplar', slug: 'startaplar', sortOrder: 2 },
  { name: 'AI', slug: 'ai', sortOrder: 3 },
  { name: 'Marketing', slug: 'marketing', sortOrder: 4 },
  { name: 'Mahsulot', slug: 'mahsulot', sortOrder: 5 },
  { name: 'Tahlil', slug: 'tahlil', sortOrder: 6 },
  { name: 'Karyera', slug: 'karyera', sortOrder: 7 },
  { name: 'Fikr', slug: 'fikr', sortOrder: 8 },
  { name: "Ta'lim", slug: 'talim', sortOrder: 9 },
  { name: 'Moliya', slug: 'moliya', sortOrder: 10 },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly realtime: RealtimeService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultCategories();
  }

  async ensureDefaultCategories() {
    const count = await this.categoryModel.countDocuments().exec();
    if (count > 0) return;

    await this.categoryModel.insertMany(
      DEFAULT_CATEGORIES.map((item) => ({ ...item, isActive: true })),
    );
  }

  private sortByName<T extends { name: string }>(categories: T[]): T[] {
    return [...categories].sort((a, b) =>
      a.name.localeCompare(b.name, 'uz', { sensitivity: 'base' }),
    );
  }

  async findAll() {
    const categories = await this.categoryModel.find().exec();
    return this.sortByName(categories.map((category) => category.toJSON()));
  }

  async findActive() {
    const categories = await this.categoryModel
      .find({ isActive: true })
      .exec();
    return this.sortByName(categories.map((category) => category.toJSON()));
  }

  async create(dto: CreateCategoryDto) {
    const exists = await this.categoryModel
      .exists({ slug: dto.slug })
      .exec();
    if (exists) {
      throw new ConflictException('Bunday slug mavjud');
    }

    const category = await this.categoryModel.create({
      name: dto.name.trim(),
      slug: dto.slug.trim().toLowerCase(),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    this.realtime.invalidate(rtTags.categories(), { public: true, admin: true });

    return category.toJSON();
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Mavzu topilmadi');
    }

    if (dto.slug && dto.slug !== category.slug) {
      const exists = await this.categoryModel
        .exists({ slug: dto.slug, _id: { $ne: id } })
        .exec();
      if (exists) {
        throw new ConflictException('Bunday slug mavjud');
      }
      category.slug = dto.slug.trim().toLowerCase();
    }

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    await category.save();
    this.realtime.invalidate(rtTags.categories(), { public: true, admin: true });
    return category.toJSON();
  }

  async findBySlug(slug: string) {
    const category = await this.categoryModel
      .findOne({ slug: slug.trim().toLowerCase(), isActive: true })
      .exec();

    if (!category) {
      throw new NotFoundException('Mavzu topilmadi');
    }

    return category;
  }

  async findByIds(ids: string[]) {
    const categories = await this.categoryModel
      .find({ _id: { $in: ids }, isActive: true })
      .exec();

    if (categories.length !== ids.length) {
      throw new NotFoundException('Bir yoki bir nechta mavzu topilmadi');
    }

    return categories;
  }

  async remove(id: string) {
    const category = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!category) {
      throw new NotFoundException('Mavzu topilmadi');
    }
    this.realtime.invalidate(rtTags.categories(), { public: true, admin: true });
    return { success: true };
  }
}
