import { Module } from '@nestjs/common';
import { ImageProxyController } from './image-proxy.controller';

@Module({
  controllers: [ImageProxyController],
})
export class ImageProxyModule {}
