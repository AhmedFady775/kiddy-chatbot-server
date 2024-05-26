import { Request, Response } from "express";
import KiddyService from "./service";

export default class KiddyController {
  public static async createNewChat(req: Request, res: Response) {
    const newChat = await KiddyService.createNewChat();

    res.status(201).json({
      newChat,
    });
  }

  public static async sendMessage(req: Request, res: Response) {
    const { chatId, message } = req.body;

    await KiddyService.sendMessage(chatId, message, res);
  }

  public static async getChat(req: Request, res: Response) {
    const { chatId } = req.params;

    const chat = await KiddyService.getChat(chatId);

    res.status(200).json({
      chat,
    });
  }
}
