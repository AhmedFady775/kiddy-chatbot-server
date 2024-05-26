import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['system', 'user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const ChatSchema = new mongoose.Schema({
  messages: [messageSchema],
});

export const ChatModel = mongoose.model('Chat', ChatSchema);
