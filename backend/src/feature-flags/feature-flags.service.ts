import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly config: ConfigService) {}

  isAgenticCmsEnabled(): boolean {
    // Only an explicit opt-in enables unreleased work.
    return this.config.get<string>('AGENTIC_CMS_ENABLED') === 'true';
  }

  isAgenticCmsEnabledFor(email?: string): boolean {
    if (!this.isAgenticCmsEnabled() || !email?.trim()) return false;
    const configured = this.config.get<string>('AGENTIC_CMS_ALLOWED_EMAILS') ?? '';
    if (!configured.trim()) return true;
    const allowed = configured.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    return allowed.includes(email.trim().toLowerCase());
  }

  assertAgenticCmsEnabledFor(email?: string): void {
    if (!this.isAgenticCmsEnabledFor(email)) throw new NotFoundException();
  }
}
