export interface ShapeInfo {
  spId: string;
  name: string;
  type: 'title' | 'body' | 'picture' | 'table' | 'chart' | 'other';
  hasCreationId: boolean;
  creationId?: string;
  text: string;
}

export interface SlideContent {
  index: number;
  sldId: string;
  slideFile: string;
  creationId?: string;
  title: string;
  bodyText: string[];
  speakerNotes: string;
  shapes: ShapeInfo[];
}

export interface DeckContent {
  slides: SlideContent[];
  slideCount: number;
}

export interface SlideImage {
  slideIndex: number;
  widthPx: number;
  heightPx: number;
  approximate: boolean;
}

export interface Finding {
  slideIndex: number;
  shapeId?: string;
  severity: 'BLOCKING' | 'MATERIAL' | 'MINOR';
  comment: string;
}

export interface DriveItemRef {
  itemId: string;
  driveId: string;
  eTag: string;
  versionId?: string;
  directDownload: boolean;
  directDownloadUrl?: string;
}

export interface UploadResult {
  status: number;
  newEtag?: string;
}

export type PptxOutcome =
  | 'comments_live'
  | 'stale'
  | 'locked'
  | 'legacy_format'
  | 'direct_download'
  | 'error';

export interface CommentWriteResult {
  outcome: PptxOutcome;
  newEtag?: string;
  message?: string;
}
