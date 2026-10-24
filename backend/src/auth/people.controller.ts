import { Body, Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { Roles } from '../common/roles.decorator';
import { PeopleService } from './people.service';

@Controller('people')
@UseGuards(AuthGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @Roles('ADMIN')
  async list() {
    return { people: await this.people.list() };
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  changeRole(@Param('id') id: string, @Body() body: { role?: unknown }) {
    return this.people.changeRole(id, body?.role);
  }
}
