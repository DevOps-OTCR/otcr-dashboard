import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ✅ new
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot(), // ✅ loads .env automatically
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
