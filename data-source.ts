// E:\workspace\clientes\otj\api\data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: process.env.SYNCHRONIZE === 'true' ? true : false,
  logging: false,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
});
