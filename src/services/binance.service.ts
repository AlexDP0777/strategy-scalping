import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../app-config/app-config.service';
import WebSocket = require('ws');
import * as crypto from 'crypto';
import * as qs from 'qs';
import axios from 'axios';

@Injectable()
export class BinanceService {
  private connectedWS: boolean;

  private baseWsUrl = 'wss://fstream.binance.com/ws';

  private baseAPIUrl = 'https://testnet.binancefuture.com/fapi/';

  private ws: WebSocket;

  private priceData: any;

  public openedPositions: number;

  private timeOffset = 0;

  private activePositions: any[] = [];

  private apiKeyHeader = {
    'X-MBX-APIKEY': this.appConfigService.binanceApiKey,
  };

  constructor(private readonly appConfigService: AppConfigService) {
    this.connectedWS = false;
    this.openedPositions = 0;
  }

  async connectWsPrice() {
    const tokenPair = this.appConfigService.tokenPair().toLocaleLowerCase();
    const url = `${this.baseWsUrl}/${tokenPair}@markPrice@1s`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('Connected to Binance Testnet WebSocket');

      this.connectedWS = true;
    });

    this.ws.on('message', (data: any) => {
      try {
        const text = typeof data === 'string' ? data : data.toString();
        this.priceData = JSON.parse(text);

        console.log('-------------------');
        console.log('Binance price :', this.priceData.p);
      } catch (err) {
        console.warn('ws message parse error', err);
      }
    });

    this.ws.on('close', () => {
      console.log('Connection closed');
      this.connectedWS = false;
    });
  }

  async disconnectWsPrice() {
    this.ws.close();
    this.connectedWS = false;
  }

  public isConnectedWS(): boolean {
    return this.connectedWS;
  }

  async updateOpenedPositionsCount(): Promise<number> {
    const params = this.createParamsWithSignature({});

    try {
      const response = await axios.get(`${this.baseAPIUrl}v2/account`, {
        headers: this.apiKeyHeader,
        params,
      });

      const positions = response.data.positions.filter((position: any) => {
        if (parseFloat(position.initialMargin) > 0) {
          return position;
        }
      });

      this.activePositions = positions;
      this.openedPositions = positions.length;
    } catch (e) {
      console.error('Error fetching opened Binance positions');
    }

    return this.openedPositions;
  }

  private createParamsWithSignature(params: Record<any, any>) {
    params = {
      ...params,
      timestamp: new Date().getTime() + this.timeOffset,
    };

    const queryString =
      Object.keys(params).length === 0
        ? ''
        : Object.keys(params)
            .map((key) => `${key}=${params[key]}`)
            .join('&');

    const signature = crypto
      .createHmac('sha256', this.appConfigService.binanceSecretKey)
      .update(queryString)
      .digest('hex');

    return { ...params, signature };
  }

  getCurrentPrice(): number {
    return this.priceData ? parseFloat(this.priceData.p) : null;
  }

  async setLeverage(symbol: string, leverage: number) {
    const endpoint = 'v1/leverage';

    const paramsWithSignature = this.createParamsWithSignature({
      symbol: symbol.toLocaleLowerCase(),
      leverage: leverage.toString(),
      timestamp: Date.now().toString(),
    });

    const url = this.baseAPIUrl + endpoint;

    try {
      await axios({
        method: 'POST',
        url: url,
        headers: {
          ...this.apiKeyHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: qs.stringify(paramsWithSignature),
      });
    } catch (err) {
      console.error('Leverage error');
      console.log(err.response?.data || err.message);
      throw err;
    }
  }

  async setMarginType(symbol: string, marginType: string) {
    const endpoint = 'v1/marginType';

    const paramsWithSignature = this.createParamsWithSignature({
      symbol: symbol.toLocaleLowerCase(),
      marginType,
      timestamp: Date.now().toString(),
    });

    const url = this.baseAPIUrl + endpoint;

    try {
      await axios({
        method: 'POST',
        url: url,
        headers: {
          ...this.apiKeyHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: qs.stringify(paramsWithSignature),
      });
    } catch (err) {
      const error = err.response?.data || err.message;
      if (error.code === -4046) {
        console.log(`MarginType already set to ${marginType}`);
        return { msg: 'NO_CHANGE', marginType };
      }

      throw err;
    }
  }

  getPosition() {
    if (this.activePositions.length > 0) {
      return this.activePositions[0];
    }

    return null;
  }

  async createOrder(params: any) {
    const endpoint = '/fapi/v1/order';

    const query = new URLSearchParams({
      symbol: params.symbol.toString(),
      side: params.side.toString(),
      type: params.type.toString(),
      timestamp: Date.now().toString(),
    });

    if (params.quantity) query.append('quantity', params.quantity);
    if (params.stopPrice) query.append('stopPrice', params.stopPrice);
    if (params.closePosition)
      query.append('closePosition', params.closePosition);
    if (params.price) query.append('price', params.price);

    const signature = this.sign(query.toString());
    query.append('signature', signature);

    try {
      const response = await axios.post(
        this.baseAPIUrl + endpoint + '?' + query.toString(),
        {},
        { headers: { 'X-MBX-APIKEY': this.appConfigService.binanceApiKey } },
      );

      return response.data;
    } catch (err) {
      console.error('Order error:', err.response?.data || err.message);
      throw err;
    }
  }

  sign(queryString: any) {
    return crypto
      .createHmac('sha256', this.appConfigService.binanceSecretKey)
      .update(queryString)
      .digest('hex');
  }
}
