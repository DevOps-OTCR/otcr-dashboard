import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { GetUser } from '../common/get-user.decorator';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly authService: AuthService) {}

  @Post('requests')
  async createRequest(
    @Body()
    body: {
      name?: string;
      email?: string;
      requestedRole?: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT';
    },
  ) {
    const name = body?.name?.trim();
    const email = body?.email?.toLowerCase().trim();

    if (!name) {
      return { success: false, message: 'Name is required' };
    }

    if (!email) {
      return { success: false, message: 'University email is required' };
    }

    if (!email.endsWith('.edu')) {
      return { success: false, message: 'Use a university email address' };
    }

    const request = await this.authService.submitOnboardingRequest(
      name,
      email,
      body?.requestedRole ?? 'CONSULTANT',
    );

    return { success: true, request };
  }

  @Get('requests')
  @UseGuards(AuthGuard)
  async listRequests(@GetUser() user: any) {
    if (!['ADMIN', 'PARTNER', 'EXECUTIVE'].includes(user.role)) {
      throw new ForbiddenException('Only Partner, Executive, or Admin can review onboarding requests');
    }

    const requests = await this.authService.listOnboardingRequests();
    return { success: true, requests };
  }

  @Patch('requests/:id/approve')
  @UseGuards(AuthGuard)
  async approveRequest(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @GetUser() user: any,
  ) {
    if (!['ADMIN', 'PARTNER', 'EXECUTIVE'].includes(user.role)) {
      throw new ForbiddenException('Only Partner, Executive, or Admin can approve onboarding requests');
    }

    const request = await this.authService.approveOnboardingRequest(id, user.id, body?.notes);
    return { success: true, request };
  }

  @Patch('requests/:id/reject')
  @UseGuards(AuthGuard)
  async rejectRequest(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @GetUser() user: any,
  ) {
    if (!['ADMIN', 'PARTNER', 'EXECUTIVE'].includes(user.role)) {
      throw new ForbiddenException('Only Partner, Executive, or Admin can reject onboarding requests');
    }

    const request = await this.authService.rejectOnboardingRequest(id, user.id, body?.notes);
    return { success: true, request };
  }
}
