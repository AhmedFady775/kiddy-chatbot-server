import 'express-async-errors';
import dotenv from 'dotenv';
dotenv.config();

import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import mainRouter from './router';
import { errorHandler } from './errorHandler';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.use('/', mainRouter);

app.use(errorHandler);

mongoose.connect(process.env.MONGO_URI!).then(() => {
  app.listen(PORT, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
  });
});
