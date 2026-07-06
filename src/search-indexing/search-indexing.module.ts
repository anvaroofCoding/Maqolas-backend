import { Module } from '@nestjs/common';
import { SearchIndexingService } from './search-indexing.service';

@Module({
  providers: [SearchIndexingService],
  exports: [SearchIndexingService],
})
export class SearchIndexingModule {}
