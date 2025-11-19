import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './app-config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { Logger } from '@nestjs/common';
import { LoggerModule } from './logger.module';
import { BinanceService } from './services/binance.service';
import { RiskModuleService } from './services/risk-module.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    LoggerModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, Logger, BinanceService, RiskModuleService],
})
export class AppModule {}
