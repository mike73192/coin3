import { resolvePublicAssetUrl } from '@/utils/assetPath';

export const DEFAULT_ARCHIVE_THUMBNAIL = 'default-thumb.svg';

export const resolveArchiveThumbnailUrl = (path?: string | null): string =>
  resolvePublicAssetUrl(path && path.trim().length > 0 ? path : DEFAULT_ARCHIVE_THUMBNAIL);
