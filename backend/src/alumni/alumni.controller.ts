import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AlumniService } from './alumni.service';

@Controller('alumni')
@UseGuards(AuthGuard)
export class AlumniController {
  constructor(private readonly alumniService: AlumniService) {}

  @Get()
  getDataset(): Record<string, unknown> {
    return this.alumniService.getDatasetRaw();
  }
}
