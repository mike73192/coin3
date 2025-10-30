export interface ArchiveEntry {
  id: string;
  title: string;
  coins: number;
  createdAt: string;
  thumbnailUrl: string;
}

export const ARCHIVE_PAGE_SIZE = 6;
