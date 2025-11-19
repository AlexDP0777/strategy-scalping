import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('start')
  async start(): Promise<{ success: boolean }> {
    await this.appService.start();

    return {
      success: true,
    };
  }

  @Get('stop')
  async stop(): Promise<{ success: boolean }> {
    await this.appService.stop();

    return {
      success: true,
    };
  }
}
