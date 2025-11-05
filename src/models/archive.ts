export interface RecordedTask {
  title: string;
  detail: string | null;
}

export interface ArchiveEntry {
  id: string;
  title: string;
  coins: number;
  createdAt: string;
  thumbnailUrl: string;
  tasks: RecordedTask[];
}

export const ARCHIVE_PAGE_SIZE = 6;
