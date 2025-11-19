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

  // New fields for window timeout and consecutive losses
  private lastPredictionTime: number = 0;
  private consecutiveLosses: number = 0;
  private pauseUntil: number = 0;

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
        this.lastPredictionTime = Date.now();
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

    if (!price) {
      return;
    }

    const previousPositionsCount = this.binanceService.openedPositions;
    await this.binanceService.updateOpenedPositionsCount();
    this.riskModuleService.updatePosition(price);
    const currentPositionsCount = this.binanceService.openedPositions;

    // Check if we need to force close positions due to window timeout
    await this.checkForceCloseOnTimeout(price);

    if (currentPositionsCount > previousPositionsCount) {
      await this.monitorPosition(price);
    } else if (currentPositionsCount < previousPositionsCount) {
      // Position was closed - check if it was a loss
      await this.handlePositionClosed(price);
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

    // Check if we're in pause after consecutive losses
    if (this.isPaused()) {
      console.log('Trading paused due to consecutive losses');
      return;
    }

    // Check window timeout - don't open new positions near end of window
    if (this.isNearWindowEnd()) {
      console.log('Near end of prediction window, not opening new positions');
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
    const entryShort = this.appConfigService.entryShort();

    if (position <= entryLong) {
      await this.openLongPosition(price);
    } else if (position >= entryShort) {
      await this.openShortPosition(price);
    }
  }

  private isNearWindowEnd(): boolean {
    if (this.lastPredictionTime === 0) {
      return false;
    }

    const timeframeMs = this.appConfigService.timeFrame() * 60 * 1000;
    const timeoutBeforeEnd = this.appConfigService.windowTimeoutBeforeEnd();
    const elapsed = Date.now() - this.lastPredictionTime;
    const remaining = timeframeMs - elapsed;

    return remaining <= timeoutBeforeEnd;
  }

  private isPaused(): boolean {
    return Date.now() < this.pauseUntil;
  }

  async checkForceCloseOnTimeout(price: number): Promise<void> {
    if (this.lastPredictionTime === 0) {
      return;
    }

    const timeframeMs = this.appConfigService.timeFrame() * 60 * 1000;
    const elapsed = Date.now() - this.lastPredictionTime;

    if (elapsed >= timeframeMs && this.binanceService.openedPositions > 0) {
      console.log('Window expired, force closing positions');
      await this.forceCloseAllPositions(price);
    }
  }

  async forceCloseAllPositions(price: number): Promise<void> {
    const position = this.binanceService.getPosition();
    if (!position) {
      return;
    }

    const positionAmt = parseFloat(position.positionAmt);
    if (positionAmt === 0) {
      return;
    }

    try {
      const side = positionAmt > 0 ? 'SELL' : 'BUY';
      await this.binanceService.createOrder({
        symbol: this.appConfigService.tokenPair().toLowerCase(),
        side: side,
        type: 'MARKET',
        quantity: Math.abs(positionAmt),
      });

      console.log('Force closed position due to window timeout');

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
    } catch (error) {
      console.error('Failed to force close position:', error);
    }
  }

  async handlePositionClosed(price: number): Promise<void> {
    const lastOperation = await OperationsEntity.findOne({
      where: { active: 0 },
      order: [['dateClose', 'DESC']],
    });

    if (lastOperation) {
      const pnl = this.calculatePnL(lastOperation, price);
      
      if (pnl < 0) {
        this.consecutiveLosses++;
        console.log('Consecutive losses: ' + this.consecutiveLosses);

        const maxConsecutiveLoss = this.appConfigService.maxConsecutiveLoss();
        if (this.consecutiveLosses >= maxConsecutiveLoss) {
          const pauseDuration = this.appConfigService.pauseAfterConsecutiveLosses();
          this.pauseUntil = Date.now() + pauseDuration;
          console.log('Pausing trading for ' + (pauseDuration / 1000) + ' seconds');
          this.consecutiveLosses = 0;
        }
      } else {
        this.consecutiveLosses = 0;
      }
    }
  }

  private calculatePnL(operation: any, closePrice: number): number {
    const openPrice = operation.priceOpen;
    const positionSize = operation.positionSize;
    
    if (operation.type === OperationType.Long) {
      return (closePrice - openPrice) * positionSize;
    } else {
      return (openPrice - closePrice) * positionSize;
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
    
    if (this.predictionUpdateIntervalId) {
      clearInterval(this.predictionUpdateIntervalId);
      this.predictionUpdateIntervalId = null;
    }
    
    if (this.inPositionCheckIntervalId) {
      clearInterval(this.inPositionCheckIntervalId);
      this.inPositionCheckIntervalId = null;
    }
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
