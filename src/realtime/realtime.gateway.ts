import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Model } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import type { AppConfig } from '../config/configuration';
import { User, UserDocument } from '../users/schemas/user.schema';
import type { RealtimeInvalidatePayload, PlatformStatsPayload } from './realtime.types';

type JwtPayload = {
  sub: string;
};

function isDevOriginAllowed(origin: string, frontendUrl: string) {
  if (origin === frontendUrl) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private platformStatsTimer: ReturnType<typeof setTimeout> | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async handleConnection(client: Socket) {
    const frontendUrl = this.config.get('frontendUrl', { infer: true });
    const nodeEnv = this.config.get('nodeEnv', { infer: true });
    const origin = client.handshake.headers.origin;

    if (
      typeof origin === 'string' &&
      nodeEnv === 'production' &&
      origin !== frontendUrl
    ) {
      client.disconnect(true);
      return;
    }

    if (
      typeof origin === 'string' &&
      nodeEnv !== 'production' &&
      !isDevOriginAllowed(origin, frontendUrl)
    ) {
      client.disconnect(true);
      return;
    }

    await client.join('public');

    const token = this.extractToken(client);
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.config.get('jwt.accessSecret', { infer: true }),
        });

        if (payload.sub) {
          await client.join(`user:${payload.sub}`);

          const user = await this.userModel
            .findById(payload.sub)
            .select('role')
            .lean()
            .exec();

          if (user?.role === 'super_admin') {
            await client.join('admin');
          }
        }
      } catch {
        this.logger.debug(`Realtime auth failed for client ${client.id}`);
      }
    }

    this.schedulePlatformStatsBroadcast();
  }

  handleDisconnect(client: Socket) {
    client.rooms.clear();
    this.schedulePlatformStatsBroadcast();
  }

  schedulePlatformStatsBroadcast() {
    if (this.platformStatsTimer) {
      return;
    }

    this.platformStatsTimer = setTimeout(() => {
      this.platformStatsTimer = null;
      void this.broadcastPlatformStats();
    }, 250);
  }

  private async broadcastPlatformStats() {
    if (!this.server) {
      return;
    }

    const payload: PlatformStatsPayload = {
      onlineNow: this.getConnectedCount(),
      totalUsers: await this.userModel.countDocuments().exec(),
    };

    this.server.to('public').emit('platform-stats', payload);
  }

  getConnectedCount() {
    return this.server?.sockets?.sockets?.size ?? 0;
  }

  emitInvalidate(rooms: string[], payload: RealtimeInvalidatePayload) {
    for (const room of rooms) {
      this.server.to(room).emit('invalidate', payload);
    }
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    return undefined;
  }
}
