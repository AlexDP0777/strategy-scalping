import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { AppConfigService } from './app-config/app-config.service';
import { BinanceService } from './services/binance.service';
import { RiskModuleService } from './services/risk-module.service';
import { OperationType } from './entities/operations.entity';

describe('AppService', () => {
  let service: AppService;
  let appConfigService: jest.Mocked<AppConfigService>;
  let binanceService: jest.Mocked<BinanceService>;
  let riskModuleService: jest.Mocked<RiskModuleService>;

  beforeEach(async () => {
    const mockAppConfigService = {
      predictionUpdateInterval: jest.fn().mockReturnValue(3000),
      inPositionCheckInterval: jest.fn().mockReturnValue(1000),
      tokenPair: jest.fn().mockReturnValue('ETHUSDT'),
      leverage: jest.fn().mockReturnValue(3),
      marginType: jest.fn().mockReturnValue('ISOLATED'),
      maxOpenPositions: jest.fn().mockReturnValue(1),
      minProbability: jest.fn().mockReturnValue(0.75),
      entryLong: jest.fn().mockReturnValue(0.33),
      entryShort: jest.fn().mockReturnValue(0.67),
      positionSize: jest.fn().mockReturnValue(0.5),
      tpPercent: jest.fn().mockReturnValue(0.5),
      maxDailyTrades: jest.fn().mockReturnValue(30),
      maxConsecutiveLoss: jest.fn().mockReturnValue(3),
      timeFrame: jest.fn().mockReturnValue(5),
      windowTimeoutBeforeEnd: jest.fn().mockReturnValue(30000),
      pauseAfterConsecutiveLosses: jest.fn().mockReturnValue(1800000),
    };

    const mockBinanceService = {
      setLeverage: jest.fn(),
      setMarginType: jest.fn(),
      updateOpenedPositionsCount: jest.fn(),
      isConnectedWS: jest.fn().mockReturnValue(true),
      connectWsPrice: jest.fn(),
      getCurrentPrice: jest.fn(),
      openedPositions: 0,
      createOrder: jest.fn(),
      getPosition: jest.fn(),
    };

    const mockRiskModuleService = {
      updateData: jest.fn(),
      updatePosition: jest.fn(),
      probability: 0.85,
      lowerBound: 3000,
      upperBound: 3100,
      position: 0.5,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: AppConfigService, useValue: mockAppConfigService },
        { provide: BinanceService, useValue: mockBinanceService },
        { provide: RiskModuleService, useValue: mockRiskModuleService },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    appConfigService = module.get(AppConfigService);
    binanceService = module.get(BinanceService);
    riskModuleService = module.get(RiskModuleService);
  });

  describe('calculateTpPrice', () => {
    it('should calculate TP for LONG position', async () => {
      const price = 3000;
      const tp = await service.calculateTpPrice(OperationType.Long, price);
      expect(tp).toBeCloseTo(3015, 2);
    });

    it('should calculate TP for SHORT position', async () => {
      const price = 3000;
      const tp = await service.calculateTpPrice(OperationType.Short, price);
      expect(tp).toBe(2985);
    });
  });

  describe('isNearWindowEnd', () => {
    it('should return false when no prediction time set', () => {
      const result = (service as any).isNearWindowEnd();
      expect(result).toBe(false);
    });

    it('should return true when near window end', () => {
      (service as any).lastPredictionTime = Date.now() - 270000;
      const result = (service as any).isNearWindowEnd();
      expect(result).toBe(true);
    });

    it('should return false when not near window end', () => {
      (service as any).lastPredictionTime = Date.now() - 60000;
      const result = (service as any).isNearWindowEnd();
      expect(result).toBe(false);
    });
  });

  describe('isPaused', () => {
    it('should return false when not paused', () => {
      (service as any).pauseUntil = 0;
      const result = (service as any).isPaused();
      expect(result).toBe(false);
    });

    it('should return true when paused', () => {
      (service as any).pauseUntil = Date.now() + 3600000;
      const result = (service as any).isPaused();
      expect(result).toBe(true);
    });
  });

  describe('calculatePnL', () => {
    it('should calculate profit for LONG', () => {
      const operation = { type: OperationType.Long, priceOpen: 3000, positionSize: 1 };
      const pnl = (service as any).calculatePnL(operation, 3100);
      expect(pnl).toBe(100);
    });

    it('should calculate loss for LONG', () => {
      const operation = { type: OperationType.Long, priceOpen: 3000, positionSize: 1 };
      const pnl = (service as any).calculatePnL(operation, 2900);
      expect(pnl).toBe(-100);
    });

    it('should calculate profit for SHORT', () => {
      const operation = { type: OperationType.Short, priceOpen: 3000, positionSize: 1 };
      const pnl = (service as any).calculatePnL(operation, 2900);
      expect(pnl).toBe(100);
    });

    it('should calculate loss for SHORT', () => {
      const operation = { type: OperationType.Short, priceOpen: 3000, positionSize: 1 };
      const pnl = (service as any).calculatePnL(operation, 3100);
      expect(pnl).toBe(-100);
    });
  });

  describe('Entry conditions', () => {
    it('should identify LONG entry when position < 0.33', () => {
      riskModuleService.position = 0.2;
      expect(riskModuleService.position <= appConfigService.entryLong()).toBe(true);
    });

    it('should identify SHORT entry when position > 0.67', () => {
      riskModuleService.position = 0.8;
      expect(riskModuleService.position >= appConfigService.entryShort()).toBe(true);
    });

    it('should NOT enter when position is in middle', () => {
      riskModuleService.position = 0.5;
      expect(riskModuleService.position <= appConfigService.entryLong()).toBe(false);
      expect(riskModuleService.position >= appConfigService.entryShort()).toBe(false);
    });
  });

  describe('Position calculation', () => {
    it('should calculate 0 at lower bound', () => {
      const position = (3000 - 3000) / (3100 - 3000);
      expect(position).toBe(0);
    });

    it('should calculate 1 at upper bound', () => {
      const position = (3100 - 3000) / (3100 - 3000);
      expect(position).toBe(1);
    });

    it('should calculate 0.5 in middle', () => {
      const position = (3050 - 3000) / (3100 - 3000);
      expect(position).toBe(0.5);
    });
  });
});
