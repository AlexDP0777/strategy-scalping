import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from './app-config/app-config.service';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const logger = app.get(Logger);

  const config = new DocumentBuilder()
    .setTitle('Binance-service')
    .addBearerAuth()
    .build();

  const appConfigService = app.get(AppConfigService);
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(appConfigService.httpPort());

  logger.log(`App started on HTTP port ${appConfigService.httpPort()}`);
}

bootstrap().then(() => {
  //
});
