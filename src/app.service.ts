import { Injectable } from '@nestjs/common';
import { BinanceService } from './services/binance.service';
import { RiskModuleService } from './services/risk-module.service';
import { AppConfigService } from './app-config/app-config.service';
import {
  OperationsEntity,
  OperationStatus,
  OperationType,
} from './entities/operations.entity';
import { Op } from 'sequelize';

@Injectable()
export class AppService {
  private status: OperationStatus;

  private readonly predictionUpdateMs: number;
  private readonly inPositionCheckMs: number;
  private predictionUpdateIntervalId: NodeJS.Timeout;
  private inPositionCheckIntervalId: NodeJS.Timeout;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly binanceService: BinanceService,
    private readonly riskModuleService: RiskModuleService,
  ) {
    this.predictionUpdateMs = appConfigService.predictionUpdateInterval();
    this.inPositionCheckMs = appConfigService.inPositionCheckInterval();
  }

  async start(): Promise<void> {
    this.status = OperationStatus.Start;

    await this.binanceService.setLeverage(
      this.appConfigService.tokenPair(),
      this.appConfigService.leverage(),
    );

    await this.binanceService.setMarginType(
      this.appConfigService.tokenPair(),
      this.appConfigService.marginType(),
    );

    await this.binanceService.updateOpenedPositionsCount();

    if (!this.binanceService.isConnectedWS()) {
      await this.binanceService.connectWsPrice();
    }

    if (!this.predictionUpdateIntervalId) {
      this.predictionUpdateIntervalId = setInterval(async () => {
        await this.riskModuleService.updateData();
      }, this.predictionUpdateMs);
    }

    if (!this.inPositionCheckIntervalId) {
      this.inPositionCheckIntervalId = setInterval(async () => {
        await this.refresh();
      }, this.inPositionCheckMs);
    }
  }

  async refresh(): Promise<void> {
    const price = this.binanceService.getCurrentPrice();

    if (price) {
      return;
    }

    const previousPositionsCount = this.binanceService.openedPositions;
    await this.binanceService.updateOpenedPositionsCount();
    this.riskModuleService.updatePosition(price);
    const currentPositionsCount = this.binanceService.openedPositions;

    if (currentPositionsCount > previousPositionsCount) {
      await this.monitorPosition(price);
    } else {
      await this.checkEntryConditions(price);
    }
  }

  async checkEntryConditions(price: number) {
    const maxOpenPositions = this.appConfigService.maxOpenPositions();
    const currentOpenedPositions = this.binanceService.openedPositions;

    if (currentOpenedPositions > maxOpenPositions - 1) {
      return;
    }

    if (!price || !this.riskModuleService.probability) {
      return;
    }

    if (await this.isDailyLimitReached()) {
      return;
    }

    const minProbability = this.appConfigService.minProbability();

    if (this.riskModuleService.probability < minProbability) {
      return;
    }

    if (!this.riskModuleService.position) {
      return;
    }

    const position = this.riskModuleService.position;
    const entryLong = this.appConfigService.entryLong();
    const entryShort = this.appConfigService.entryLong();

    if (position <= entryLong) {
      await this.openLongPosition(price);
    } else if (position >= entryShort) {
      await this.openShortPosition(price);
    }
  }

  async isDailyLimitReached() {
    const dailyLimitOperation = this.appConfigService.maxDailyTrades();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const totalOperationsToday = await OperationsEntity.count({
      where: {
        dateOpen: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    console.log('totalOperationsToday', totalOperationsToday);

    return totalOperationsToday >= dailyLimitOperation;
  }

  async openLongPosition(price: number): Promise<void> {
    const stopLoss = this.riskModuleService.lowerBound;
    const takeProfit = await this.calculateTpPrice(OperationType.Long, price);

    try {
      const order = await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLocaleLowerCase(),
        side: 'BUY',
        type: 'MARKET',
        quantity: this.appConfigService.positionSize(),
      });

      await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLocaleLowerCase(),
        side: 'SELL',
        type: 'STOP_MARKET',
        stopPrice: stopLoss,
        closePosition: true,
      });

      await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLocaleLowerCase(),
        side: 'SELL',
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: takeProfit,
        closePosition: true,
      });

      this.binanceService.openedPositions++;

      await OperationsEntity.create({
        serviceOrderNumber: order.orderId,
        positionSize: this.appConfigService.positionSize(),
        type: OperationType.Long,
        dateOpen: new Date(),
        priceOpen: price,
        lowerBoundOpen: this.riskModuleService.lowerBound,
        upperBoundOpen: this.riskModuleService.upperBound,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
      });
    } catch (error) {
      console.error('Failed to open LONG position');
    }
  }

  async openShortPosition(price: number): Promise<void> {
    const stopLoss = this.riskModuleService.upperBound;
    const takeProfit = await this.calculateTpPrice(OperationType.Short, price);

    try {
      const order = await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLocaleLowerCase(),
        side: 'SELL',
        type: 'MARKET',
        quantity: this.appConfigService.positionSize(),
      });

      await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLocaleLowerCase(),
        side: 'BUY',
        type: 'STOP_MARKET',
        stopPrice: stopLoss,
        closePosition: true,
      });

      await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLocaleLowerCase(),
        side: 'BUY',
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: takeProfit,
        closePosition: true,
      });

      this.binanceService.openedPositions++;

      await OperationsEntity.create({
        serviceOrderNumber: order.orderId,
        positionSize: this.appConfigService.positionSize(),
        type: OperationType.Short,
        dateOpen: new Date(),
        priceOpen: price,
        lowerBoundOpen: this.riskModuleService.lowerBound,
        upperBoundOpen: this.riskModuleService.upperBound,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
      });
    } catch (error) {
      console.error('Failed to open SHORT position');
    }
  }

  async stop(): Promise<void> {
    this.status = OperationStatus.Stop;
  }

  async calculateTpPrice(type: OperationType, price: number): Promise<number> {
    const tpPercent = this.appConfigService.tpPercent();

    if (type === OperationType.Long) {
      return price * (1 + tpPercent / 100);
    } else {
      return price * (1 - tpPercent / 100);
    }
  }

  async monitorPosition(price: number) {
    const position = this.binanceService.getPosition();
    if (!position || position.positionAmt === 0) {
      console.log('Position closed');

      await OperationsEntity.update(
        {
          active: 0,
          lowerBoundClose: this.riskModuleService.lowerBound,
          upperBoundClose: this.riskModuleService.upperBound,
          dateClose: new Date(),
          priceClose: price,
        },
        {
          where: {
            active: 1,
          },
        },
      );
    }
  }
}
