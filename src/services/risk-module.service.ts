import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class RiskModuleService {
  private readonly riskModuleUrl =
    'http://164.90.156.209/api/testing/calculate-current-market-probability';
  private riskModuleData: any;

  public probability: number;
  public lowerBound: number;
  public upperBound: number;
  public expectedPrice: number;
  public position: number;

  constructor(private readonly appConfigService: AppConfigService) {
    this.riskModuleData = {
      steps: this.appConfigService.riskModuleSteps(),
      range: this.appConfigService.riskModuleRange(),
    };
  }

  public async updateData() {
    const result = (await axios
      .post(this.riskModuleUrl, this.riskModuleData)
      .then((x) => x.data)) as any;

    if (result && result.probability_within_range) {
      this.probability = result.probability_within_range;
      this.lowerBound = result.lower_bound;
      this.upperBound = result.upper_bound;
      this.expectedPrice = result.expected_price;

      console.log('-------------------');
      console.log('Risk Module Data Updated:');
      console.log('probability', this.probability);
      console.log('lowerBound', this.lowerBound);
      console.log('upperBound', this.upperBound);
      console.log('expectedPrice', this.expectedPrice);
    }
  }

  public updatePosition(price: number): void {
    const rangeWidth = this.upperBound - this.lowerBound;

    this.position = (price - this.lowerBound) / rangeWidth;
    console.log('position', this.position);
  }
}
