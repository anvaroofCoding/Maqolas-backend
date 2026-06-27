import { Injectable } from '@nestjs/common';
import type {
  RealtimeInvalidateOptions,
  RealtimeInvalidatePayload,
  RealtimeTag,
} from './realtime.types';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  invalidate(tags: RealtimeTag[], options: RealtimeInvalidateOptions = {}) {
    if (tags.length === 0) {
      return;
    }

    const payload: RealtimeInvalidatePayload = { tags };
    const rooms: string[] = [];

    if (options.public ?? (!options.userId && !options.admin)) {
      rooms.push('public');
    }
    if (options.userId) {
      rooms.push(`user:${options.userId}`);
    }
    if (options.admin) {
      rooms.push('admin');
    }

    const uniqueRooms = [...new Set(rooms)];
    if (uniqueRooms.length === 0) {
      return;
    }

    this.gateway.emitInvalidate(uniqueRooms, payload);
  }

  getOnlineCount() {
    return this.gateway.getConnectedCount();
  }

  schedulePlatformStatsBroadcast() {
    this.gateway.schedulePlatformStatsBroadcast();
  }
}
