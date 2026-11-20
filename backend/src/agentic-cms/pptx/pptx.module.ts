import { Module } from '@nestjs/common';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { PptxCommentWriterService } from './pptx-comment-writer.service';
import { PptxReaderService } from './pptx-reader.service';
import { PptxRendererService } from './pptx-renderer.service';

@Module({
  providers: [MicrosoftGraphService, PptxReaderService, PptxCommentWriterService, PptxRendererService],
  exports: [MicrosoftGraphService, PptxReaderService, PptxCommentWriterService, PptxRendererService],
})
export class PptxModule {}
