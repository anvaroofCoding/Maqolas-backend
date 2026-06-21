import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArticlesModule } from '../articles/articles.module';
import { EmailModule } from '../email/email.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WeeklyDigestScheduler } from './weekly-digest.scheduler';
import { WeeklyDigestService } from './weekly-digest.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    ArticlesModule,
    EmailModule,
  ],
  providers: [WeeklyDigestService, WeeklyDigestScheduler],
  exports: [WeeklyDigestService],
})
export class DigestModule {}
