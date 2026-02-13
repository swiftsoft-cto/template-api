import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../administration/users/users.module';
import { RolesModule } from '../administration/roles/roles.module';
import { RedisModule } from '../_common/redis/redis.module';
import { MailModule } from '../_common/mail/mail.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CsrfGuard } from './guards/csrf.guard';
import { RulesGuard } from './guards/rules.guard';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { LoginRateLimitInterceptor } from './interceptors/login-rate-limit.interceptor';
import { TokenCleanupJob } from './jobs/token-cleanup.job';
import { DeviceCleanupJob } from './jobs/device-cleanup.job';
import { SecurityAlertsService } from './security-alerts.service';
import { AccountBlockModule } from './account-block.module';
import { RefreshToken } from './refresh-token.entity';
import { TrustedDevice } from './trusted-device.entity';
import { BlacklistedDevice } from './blacklisted-device.entity';
import { Company } from '../administration/company/company.entity';
import { User } from '../administration/users/user.entity';

@Module({
  imports: [
    JwtModule.register({}),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
    UsersModule,
    RolesModule,
    RedisModule,
    MailModule,
    AccountBlockModule,
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      TrustedDevice,
      BlacklistedDevice,
      Company,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    CsrfGuard,
    RulesGuard,
    RateLimitInterceptor,
    LoginRateLimitInterceptor,
    TokenCleanupJob,
    DeviceCleanupJob,
    SecurityAlertsService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
