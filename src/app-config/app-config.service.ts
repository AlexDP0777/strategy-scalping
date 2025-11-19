import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const APP_ENV = 'APP_ENV';
export const HTTP_PORT = 'HTTP_PORT';

export const BINANCE_API_KEY = 'BINANCE_API_KEY';
export const BINANCE_API_SECRET = 'BINANCE_API_SECRET';

export const TOKEN_PAIR = 'TOKEN_PAIR';

export const POSTGRES_HOST = 'POSTGRES_HOST';
export const POSTGRES_PORT = 'POSTGRES_PORT';
export const POSTGRES_USERNAME = 'POSTGRES_USERNAME';
export const POSTGRES_PASSWORD = 'POSTGRES_PASSWORD';
export const POSTGRES_DATABASE = 'POSTGRES_DATABASE';

export const RISK_MODULE_STEPS = 'RISK_MODULE_STEPS';
export const RISK_MODULE_RANGE = 'RISK_MODULE_RANGE';

export const TIMEFRAME_MINUTES = 'TIMEFRAME_MINUTES';
export const BASE_PRICE = 'BASE_PRICE';
export const ENTRY_LONG = 'ENTRY_LONG';
export const ENTRY_SHORT = 'ENTRY_SHORT';
export const MIN_PROBABILITY = 'MIN_PROBABILITY';
export const TP_STRATEGY = 'TP_STRATEGY';
export const FIXED_RR_RATIO = 'FIXED_RR_RATIO';
export const CAPITAL = 'CAPITAL';
export const LEVERAGE = 'LEVERAGE';
export const POSITION_SIZE = 'POSITION_SIZE';
export const MARGIN_TYPE = 'MARGIN_TYPE';
export const MAX_DAILY_LOSS = 'MAX_DAILY_LOSS';
export const MAX_CONSECUTIVE_LOSS = 'MAX_CONSECUTIVE_LOSS';
export const MAX_DAILY_TRADES = 'MAX_DAILY_TRADES';
export const MAX_OPEN_POSITIONS = 'MAX_OPEN_POSITIONS';
export const TP_PERCENT = 'TP_PERCENT';
export const PREDICTION_UPDATE_INTERVAL_MS = 'PREDICTION_UPDATE_INTERVAL_MS';
export const IN_POSITION_CHECK_INTERVAL_MS = 'IN_POSITION_CHECK_INTERVAL_MS';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  public appEnv(): string {
    return this.configService.get(APP_ENV);
  }

  public isProduction(): boolean {
    return this.appEnv() === 'prod';
  }

  public httpPort(): number {
    return this.configService.get(HTTP_PORT);
  }

  public get binanceApiKey(): string {
    return this.configService.get(BINANCE_API_KEY);
  }

  public get binanceSecretKey(): string {
    return this.configService.get(BINANCE_API_SECRET);
  }

  public tokenPair(): string {
    return this.configService.get(TOKEN_PAIR);
  }

  public postgresHost(): string {
    return this.configService.get(POSTGRES_HOST);
  }

  public postgresPort(): number {
    return this.configService.get(POSTGRES_PORT);
  }

  public postgresUsername(): string {
    return this.configService.get(POSTGRES_USERNAME);
  }

  public postgresPassword(): string {
    return this.configService.get(POSTGRES_PASSWORD);
  }

  public postgresDatabase(): string {
    return this.configService.get(POSTGRES_DATABASE);
  }

  public riskModuleSteps(): string {
    return this.configService.get(RISK_MODULE_STEPS);
  }

  public riskModuleRange(): string {
    return this.configService.get(RISK_MODULE_RANGE);
  }

  public timeFrame(): number {
    return parseFloat(this.configService.get(TIMEFRAME_MINUTES));
  }

  public basePrice(): number {
    return parseFloat(this.configService.get(BASE_PRICE));
  }

  public entryLong(): number {
    return parseFloat(this.configService.get(ENTRY_LONG));
  }

  public entryShort(): number {
    return parseFloat(this.configService.get(ENTRY_SHORT));
  }

  public minProbability(): number {
    return parseFloat(this.configService.get(MIN_PROBABILITY));
  }

  public tpStrategy(): string {
    return this.configService.get(TP_STRATEGY);
  }

  public fixedRRRatio(): number {
    return parseFloat(this.configService.get(FIXED_RR_RATIO));
  }

  public capital(): number {
    return parseFloat(this.configService.get(CAPITAL));
  }

  public leverage(): number {
    return parseFloat(this.configService.get(LEVERAGE));
  }

  public positionSize(): number {
    return parseFloat(this.configService.get(POSITION_SIZE));
  }

  public marginType(): string {
    return this.configService.get(MARGIN_TYPE);
  }

  public maxDailyLoss(): number {
    return parseFloat(this.configService.get(MAX_DAILY_LOSS));
  }

  public maxConsecutiveLoss(): number {
    return parseFloat(this.configService.get(MAX_CONSECUTIVE_LOSS));
  }

  public maxDailyTrades(): number {
    return parseFloat(this.configService.get(MAX_DAILY_TRADES));
  }

  public maxOpenPositions(): number {
    return parseFloat(this.configService.get(MAX_OPEN_POSITIONS));
  }

  public predictionUpdateInterval(): number {
    return parseFloat(this.configService.get(PREDICTION_UPDATE_INTERVAL_MS));
  }

  public inPositionCheckInterval(): number {
    return parseFloat(this.configService.get(IN_POSITION_CHECK_INTERVAL_MS));
  }

  public tpPercent(): number {
    return parseFloat(this.configService.get(TP_PERCENT));
  }
}
