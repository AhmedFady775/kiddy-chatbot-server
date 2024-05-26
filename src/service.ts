import { StatusCodes } from "http-status-codes";
import { APIError } from "./errorHandler";
import { ChatModel } from "./model";
import axios from "axios";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Response } from "express";

export default class KiddyService {
  static customSearch = google.customsearch("v1");

  static youtubeSearch = google.youtube({
    version: "v3",
    auth: process.env.GOOGLE_API_KEY!,
  });

  public static async createNewChat() {
    const newChat = new ChatModel({
      messages: [],
    });

    await newChat.save();

    return newChat;
  }

  static async sendMessageToSearchBot(message: string) {
    const res = await axios.post("http://localhost:11434/api/generate", {
      model: "kiddy-search",
      prompt: `{
        "kid_prompt": "${message}"
      }`,
      stream: false,
      keep_alive: "1h",
    });

    console.log(res.data);

    return JSON.parse(res.data.response);
  }

  static async sendMessageToKiddyBot(
    messages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[]
  ) {
    const body = {
      model: "kiddy",
      messages,
      // stream: false,
      keep_alive: "1h",
    };

    const res = await fetch("http://localhost:11434/api/chat", {
      method: "post",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

    return res.body;
  }

  static async searchGoogle(query: string) {
    const response = await this.customSearch.cse.list({
      q: query,
      cx: process.env.GOOGLE_CSE_CX!,
      auth: process.env.GOOGLE_API_KEY!,
      num: 10, // Number of results to return
    });

    const results = response!.data!.items!.map((item) => ({
      link: item.link,
      snippet: item.snippet,
    }));

    return results;
  }

  static async searchYoutube(query: string) {
    const response = await this.youtubeSearch.search.list({
      q: query,
      part: ["snippet"],
      maxResults: 3,
      safeSearch: "strict",
    });

    const results = response!.data!.items!.map((item: any) => ({
      title: item.snippet.title,
      description: item.snippet.description,
      videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));

    return results;
  }

  public static async sendMessage(
    chatId: string,
    message: string,
    res: Response
  ) {
    // get the chat
    const chat = await ChatModel.findById(chatId);

    if (!chat) {
      throw new APIError("Chat not found", StatusCodes.NOT_FOUND);
    }

    // send the message to search bot
    let searchBotResults;
    try {
      searchBotResults = await this.sendMessageToSearchBot(message);
    } catch (error) {
      console.log(error);
      searchBotResults = {
        required: false,
        website: "",
        query: "",
      };
    }

    if (searchBotResults.response) {
      searchBotResults = searchBotResults.response;
    }

    console.log(searchBotResults);

    if (searchBotResults.error) {
      throw new APIError(
        searchBotResults.error,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    // search for web results
    if (searchBotResults.website === "google") {
      try {
        searchBotResults.webResults = await this.searchGoogle(
          searchBotResults.query
        );
      } catch (error) {
        console.log(error);
        throw new APIError(
          "Error fetching google search results",
          StatusCodes.INTERNAL_SERVER_ERROR
        );
      }
    }

    if (searchBotResults.website === "youtube") {
      try {
        searchBotResults.webResults = await this.searchYoutube(
          searchBotResults.query
        );
      } catch (error) {
        console.log(error);
        throw new APIError(
          "Error fetching YouTube search results",
          StatusCodes.INTERNAL_SERVER_ERROR
        );
      }
    }

    // send message and web results to kiddy bot
    const newMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];

    if (!searchBotResults.required) {
      newMessages.push({
        role: "user",
        content: message,
      });
    } else if (searchBotResults.website === "google") {
      let systemMessage = `Here are the search results for "${searchBotResults.query}" on Google:`;

      searchBotResults.webResults.forEach((result: any) => {
        systemMessage += `\n\n${result.link}\n${result.snippet}`;
      });

      systemMessage +=
        "\n\n Answer the question first on your own in a simply kid friendly way using story telling if needed and emojis without using the provided search results then provide the links to the kid explaining what each link is about.";

      systemMessage +=
        "\n\n use these search results as a supporting material to help respond to the next user message. provide the kid with links from this search result saying that they can find more information here.";

      systemMessage +=
        "\n\n don't forget to ask the kid to view the provided results and come back with questions.";

      systemMessage += "\n\n provide the website links in markdown format.";
      newMessages.push({
        role: "system",
        content: systemMessage,
      });

      newMessages.push({
        role: "user",
        content: message,
      });
    } else if (searchBotResults.website === "youtube") {
      let systemMessage = `Here are the search results for "${searchBotResults.query}" on YouTube:`;

      searchBotResults.webResults.forEach((result: any) => {
        systemMessage += `\n\nvideo title: ${result.title}\nvideo description: ${result.description}\nvideo link: ${result.videoUrl}`;
      });

      systemMessage +=
        "\n\n use these search results to help respond to the next user message. provide the kid with links from this search result saying that these videos will help them understand the topic better.";

      systemMessage +=
        "\n\n don't forget to ask the kid to watch the videos and come back with questions.";

      systemMessage +=
        "\n\n if the kid is not interested in the videos, you can ask them to search for more videos on the topic on YouTube.";

      systemMessage +=
        "\n\n show the videos titles only don't show the description (only use the description to understand what this video is about) and show the links in markdown format.";

      systemMessage +=
        "\n\n answer the kid's questions first on your own, provide information about the topic itself and then provide the videos as supporting material.";

      newMessages.push({
        role: "system",
        content: systemMessage,
      });

      newMessages.push({
        role: "user",
        content: message,
      });
    }

    console.log(newMessages);

    const kiddyBotResponse = await this.sendMessageToKiddyBot([
      ...chat.messages,
      ...newMessages,
    ] as any);

    let fullResponse = "";

    res.setHeader("Content-Type", "application/json");
    for await (const chunk of kiddyBotResponse!) {
      const data = chunk.toString();

      try {
        const jsonData = JSON.parse(data);
        fullResponse += jsonData.message.content;
      } catch (error) {}

      res.write(data);
    }

    res.end();

    // save message, web results as system message and kiidy bot response to chat
    for (const message of newMessages) {
      chat.messages.push(message);
    }

    chat.messages.push({
      role: "assistant",
      content: fullResponse,
    });

    try {
      await chat.save();
    } catch (error) {
      console.log(error);
      throw new APIError(
        "Error saving chat",
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }

  public static async getChat(chatId: string) {
    const chat = await ChatModel.findById(chatId);

    if (!chat) {
      throw new APIError("Chat not found", StatusCodes.NOT_FOUND);
    }

    // remove system messages
    const messages = chat!.messages.filter(
      (message) => message.role !== "system"
    );

    return messages;
  }
}
