import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import type { AppConfig } from '../config/configuration';

const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
const GOOGLE_INDEXING_URL =
  'https://indexing.googleapis.com/v3/urlNotifications:publish';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

@Injectable()
export class SearchIndexingService {
  private readonly logger = new Logger(SearchIndexingService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  notifyArticlePublished(slug: string, type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED') {
    const url = this.buildArticleUrl(slug);
    void this.pingIndexNow(url);
    void this.pingGoogleIndexing(url, type);
    void this.revalidateFrontend(slug);
  }

  private buildArticleUrl(slug: string): string {
    const siteUrl = this.config
      .get('publicSiteUrl', { infer: true })
      .replace(/\/$/, '');
    return `${siteUrl}/maqola/${encodeURIComponent(slug)}`;
  }

  private getSiteHost(): string {
    try {
      return new URL(this.config.get('publicSiteUrl', { infer: true })).hostname;
    } catch {
      return 'maqolas.tm2.uz';
    }
  }

  private async pingIndexNow(url: string): Promise<void> {
    const key = this.config.get('searchIndexing.indexNowKey', { infer: true });
    if (!key) return;

    const host = this.getSiteHost();
    const siteUrl = this.config
      .get('publicSiteUrl', { infer: true })
      .replace(/\/$/, '');
    const keyLocation = `${siteUrl}/indexnow-key.txt`;

    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key,
          keyLocation,
          urlList: [url],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(
          `IndexNow ping failed (${response.status}) for ${url}: ${body.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.warn(`IndexNow ping error for ${url}: ${String(error)}`);
    }
  }

  private async pingGoogleIndexing(
    url: string,
    type: 'URL_UPDATED' | 'URL_DELETED',
  ): Promise<void> {
    const rawCredentials = this.config.get(
      'searchIndexing.googleIndexingServiceAccountJson',
      { infer: true },
    );
    if (!rawCredentials) return;

    try {
      const credentials = this.parseServiceAccountJson(rawCredentials);
      const auth = new GoogleAuth({
        credentials,
        scopes: [INDEXING_SCOPE],
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();

      if (!token.token) {
        this.logger.warn('Google Indexing API: access token olinmadi');
        return;
      }

      const response = await fetch(GOOGLE_INDEXING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.token}`,
        },
        body: JSON.stringify({ url, type }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(
          `Google Indexing API failed (${response.status}) for ${url}: ${body.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Google Indexing API error for ${url}: ${String(error)}`);
    }
  }

  private parseServiceAccountJson(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as Record<string, unknown>;
    }

    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  private async revalidateFrontend(slug: string): Promise<void> {
    const secret = this.config.get('searchIndexing.revalidateSecret', {
      infer: true,
    });
    if (!secret) return;

    const frontendUrl = this.config
      .get('frontendUrl', { infer: true })
      .replace(/\/$/, '');
    const paths = [
      `/maqola/${slug}`,
      '/feed.xml',
      '/',
      '/maqolalar',
      '/yangi',
      '/sitemap.xml',
    ];

    try {
      const response = await fetch(`${frontendUrl}/api/revalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(
          `Frontend revalidation failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Frontend revalidation error: ${String(error)}`);
    }
  }
}
