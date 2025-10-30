export interface SyncPayload {
  // Placeholder for future integration.
}

export class SyncService {
  async push(_payload: SyncPayload): Promise<void> {
    // 同期は将来実装予定
    return Promise.resolve();
  }
}

export const syncService = new SyncService();
