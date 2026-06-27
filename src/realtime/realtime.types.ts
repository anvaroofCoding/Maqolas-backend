export type RealtimeTag = {
  type: string;
  id?: string;
};

export type RealtimeInvalidatePayload = {
  tags: RealtimeTag[];
};

export type PlatformStatsPayload = {
  onlineNow: number;
  totalUsers: number;
};

export type RealtimeInvalidateOptions = {
  /** Broadcast to all connected clients */
  public?: boolean;
  /** Send only to a specific user room */
  userId?: string;
  /** Send only to super_admin clients */
  admin?: boolean;
};
