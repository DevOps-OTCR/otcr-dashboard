import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { OnboardingController } from './onboarding.controller';

@Module({
  controllers: [AuthController, OnboardingController, PeopleController],
  providers: [AuthService, AuthGuard, PeopleService],
  exports: [AuthService, AuthGuard, PeopleService],
})
export class AuthModule {}
