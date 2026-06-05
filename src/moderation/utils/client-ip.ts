import type { Request } from 'express';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() || 'unknown';
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}
