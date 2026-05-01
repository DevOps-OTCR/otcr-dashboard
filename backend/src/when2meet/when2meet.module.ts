import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { When2MeetController } from './when2meet.controller';
import { When2MeetService } from './when2meet.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [When2MeetController],
  providers: [When2MeetService],
})
export class When2MeetModule {}
