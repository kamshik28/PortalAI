// app.service.ts

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ensureCollectionExists, ensurePayloadIndexes, QDRANT_COLLECTION } from './lib/qdrant';

/**
 * Application-level service.
 *
 * OnModuleInit runs once after every module has been initialised.
 * We use it to ensure the Qdrant collection and its payload indexes exist
 * before any request is handled, instead of repeating the check on every
 * upload or sync call.
 */
@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger('AppService');

  async onModuleInit() {
    this.logger.log(`[QDRANT] startup init for collection "${QDRANT_COLLECTION}"`);
    try {
      await ensureCollectionExists();
      await ensurePayloadIndexes();
      this.logger.log('[QDRANT] startup init complete');
    } catch (e) {
      // Non-fatal: the app still starts; individual requests will surface errors.
      this.logger.warn(
        '[QDRANT] startup init warning: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
