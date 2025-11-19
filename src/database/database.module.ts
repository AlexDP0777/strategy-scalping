import { Module } from '@nestjs/common';
import { databaseProviders } from './database.providers';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
  imports: [AppConfigModule],
  providers: [...databaseProviders],
  exports: [...databaseProviders],
})
export class DatabaseModule {}
