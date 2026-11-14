import { Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';
import { SlackRoleSuggestionsService } from './slack-role-suggestions.service';

@Controller('integrations/slack/role-suggestions')
@UseGuards(AuthGuard)
export class SlackRoleSuggestionsController {
  constructor(private readonly suggestions: SlackRoleSuggestionsService) {}

  @Get()
  @Roles('ADMIN')
  list() {
    return this.suggestions.list();
  }

  @Post('sync')
  @Roles('ADMIN')
  sync() {
    return this.suggestions.sync();
  }

  @Patch(':id/approve')
  @Roles('ADMIN')
  approve(@Param('id') id: string, @GetUser() user: { id: string }) {
    return this.suggestions.approve(id, user.id);
  }

  @Patch(':id/dismiss')
  @Roles('ADMIN')
  dismiss(@Param('id') id: string, @GetUser() user: { id: string }) {
    return this.suggestions.dismiss(id, user.id);
  }
}
