import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { isAllowedProxyImageUrl } from './is-allowed-proxy-image-url';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

@Controller('image-proxy')
export class ImageProxyController {
  @Get()
  async proxyImage(@Query('url') url: string | undefined, @Res() res: Response) {
    if (!url?.trim() || !isAllowedProxyImageUrl(url)) {
      throw new BadRequestException("Ruxsat berilmagan yoki noto'g'ri URL");
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, {
        headers: {
          'User-Agent': 'MaqolasImageProxy/1.0',
          Accept: 'image/*',
        },
        redirect: 'follow',
      });
    } catch {
      throw new BadRequestException('Rasm yuklanmadi');
    }

    if (!upstream.ok) {
      throw new NotFoundException('Rasm topilmadi');
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException("Faqat rasm fayllari qo'llab-quvvatlanadi");
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Rasm juda katta');
    }

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(buffer);
  }
}
