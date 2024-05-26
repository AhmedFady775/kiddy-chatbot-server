import express from 'express';
import KiddyController from './controller';

const mainRouter = express.Router();

mainRouter.get('/create_chat', KiddyController.createNewChat);
mainRouter.post('/send_message', KiddyController.sendMessage);
mainRouter.get('/chat/:chatId', KiddyController.getChat);

export default mainRouter;
