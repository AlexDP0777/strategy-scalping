import {
  AutoIncrement,
  Column,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { DataTypes } from 'sequelize';

export enum OperationStatus {
  Start = 1,
  Stop,
}

export enum OperationType {
  Short = 'Short',
  Long = 'Long',
}

@Table
export class OperationsEntity extends Model<OperationsEntity> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  serviceOrderNumber: string;

  @Column({ type: DataTypes.FLOAT })
  positionSize: number;

  @Column({ type: DataTypes.STRING })
  type: OperationType;

  @Column({ type: DataTypes.DATE })
  dateOpen: Date;

  @Column({ type: DataTypes.DATE, allowNull: true })
  dateClose: Date;

  @Column({ type: DataTypes.FLOAT })
  priceOpen: number;

  @Column({ type: DataTypes.FLOAT, allowNull: true })
  priceClose: number;

  @Column({ type: DataTypes.FLOAT })
  public lowerBoundOpen: number;

  @Column({ type: DataTypes.FLOAT })
  public upperBoundOpen: number;

  @Column({ type: DataTypes.FLOAT, allowNull: true })
  public lowerBoundClose: number;

  @Column({ type: DataTypes.FLOAT, allowNull: true })
  public upperBoundClose: number;

  @Column({ type: DataTypes.FLOAT, allowNull: true })
  public stopLoss: number;

  @Column({ type: DataTypes.FLOAT, allowNull: true })
  public takeProfit: number;

  @Column({ type: DataTypes.INTEGER, defaultValue: 1 })
  public active: number;
}
