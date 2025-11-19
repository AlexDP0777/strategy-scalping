import { Sequelize, SequelizeOptions } from 'sequelize-typescript';
import { Provider } from '@nestjs/common';
import { AppConfigService } from '../app-config/app-config.service';
import { OperationsEntity } from '../entities/operations.entity';

export const databaseProviders: Provider<any>[] = [
  {
    provide: 'SEQUELIZE',
    useFactory: async (appConfigService) => {
      const options = {
        logging: false,
        dialect: 'postgres',
        host: appConfigService.postgresHost(),
        port: appConfigService.postgresPort(),
        username: appConfigService.postgresUsername(),
        password: appConfigService.postgresPassword(),
        database: appConfigService.postgresDatabase(),
        ssl: appConfigService.isProduction(),
        ...(appConfigService.isProduction()
          ? {
              dialectOptions: {
                ssl: {
                  require: true,
                  rejectUnauthorized: false,
                },
              },
            }
          : {}),
      };

      const sequelize = new Sequelize(<SequelizeOptions>options);
      sequelize.addModels([OperationsEntity]);
      await sequelize.sync();
      return sequelize;
    },
    inject: [AppConfigService],
  },
];
