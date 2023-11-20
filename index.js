import dotenv from 'dotenv';
dotenv.config()
import TelegramBot from 'node-telegram-bot-api';
import { connectToDatabase } from './db.js';
import botConstants from './constants.js';
import parseChannels from './parseChannels.js';

(async () => {
  const tgBot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })
  const clients = [];
  const dbClient = await connectToDatabase()
  parseChannels(dbClient)

  tgBot.on('message', async (message) => {
    const text = message.text;
    if (text === '/start') {
      const chatId = message.chat.id;
      const userName = message.chat.username;
      const client = clients.find(client => client.id == chatId)

      if (!client) {
        const botInstance = new Bot(tgBot, dbClient, chatId)
        const client = {
          id: chatId,
          username: userName,
          botInstance: botInstance
        }

        clients.push(client)
      }
    }
  })
})()

class Bot {
  constructor(tgBot, dbClient, chatId) {
    this.tgBot = tgBot
    this.dbClient = dbClient
    this.chatId = chatId
    this.commandsHandler = new CommandsHandler(this.tgBot, this.dbClient, this.chatId)
    this.state = {
      page: 'startPage',
      active: true,
      isSenderBlocked: false,
    }

    this.build()
  }

  async build() {
    this.db = await this.dbClient.db("tg_repost_bot")
    const currentConnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
    if (!currentConnection) {
      const connection = {
        chatId: this.chatId,
        posts: []
      }

      await this.db.collection("connections").insertOne(connection)
    }
    
    this.commandsHandler.sendStartPageMsg()
    this.createEvents();
    this.loopPostSender();
  }

  async loopPostSender() {
    if (!this.state.active || this.state.isSenderBlocked) {
      setTimeout(() => {
        this.loopPostSender()
      }, 1000 * 10);
      return
    }

    const currentConnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
    const posts = currentConnection.posts;
    const postsToSend = posts.filter(post => !post.sended)

    for (const post of postsToSend) {
      await this.sendPost(post)
      await this.delay(5)
    }

    setTimeout(() => {
      this.loopPostSender()
    }, 1000 * 10);
  }

  sendPost(post) {
    return new Promise(async (resolve, reject) => {
      if (!this.state.active || this.state.isSenderBlocked) {
        resolve(true)
        return
      }

      try {
        if (post.media.length) {
          const mediaGroup = [];
          post.media.forEach((media, index) => {
            const type = botConstants.mediaTypes[media['type']];
            const url = media.url;
            
            const mediaObj = {
              type,
              media: url
            }
  
            mediaGroup.push(mediaObj)
          })
  
          await this.tgBot.sendMediaGroup(this.chatId, mediaGroup)
          let description = post.description
          description = description.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '');
          description = description.replaceAll('<br/>', '');
          description = description.replaceAll('<br />', '');
          description = description.replaceAll('</br>', '');
          description = description.replace(/<img[^>]*>/g, '');
          description = description.replace(/<a\s*[^>]*><\/a>/g, '');
          description = description.trim()

          if (!description) {
            description = 'Выберите действие:'
          }

          await this.tgBot.sendMessage(this.chatId, description,
            { parse_mode: 'HTML', 
              reply_markup: { 
                inline_keyboard: [
                  [{ text: 'Редактировать ✏️', callback_data: post.link }, { text: 'Удалить ❌', callback_data: post.link }],
                ], 
              } 
            } 
          )
        } else {
          let description = post.description;
          description = description.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '');
          description = description.replaceAll('<br/>', '');
          description = description.replaceAll('<br />', '');
          description = description.replaceAll('</br>', '');
          description = description.replace(/<img[^>]*>/g, '');
          description = description.replace(/<a\s*[^>]*><\/a>/g, '');
          description = description.trim();
  
          await this.tgBot.sendMessage(this.chatId, description,
            { parse_mode: 'HTML', 
              reply_markup: { 
                inline_keyboard: [
                  [{ text: 'Редактировать ✏️', callback_data: post.link }, { text: 'Удалить ❌', callback_data: post.link }],
                ], 
              } 
            }
          )
        }

        resolve(true)
      } catch (error) {
        resolve(true)
      }
    })
  }

  createEvents() {
    this.tgBot.on('message', async (message) => {
      if (this.chatId !== message.from.id) return

      const text = message.text;
      const repliedMessage = message['reply_to_message']

      if (repliedMessage) {
        const repliedText = repliedMessage.text;
        let status;

        switch (repliedText) {
          case botConstants.messages.updateSubscribedChannels:
            const subscribedChannels = text.split('\n')
            status = await this.commandsHandler.handleSaveSubcribedChannels(subscribedChannels)
            if (status.ok) {
              this.commandsHandler.sendSuccessfullyUpdatedSubscribedChannels()
            } else {
              this.commandsHandler.sendErrorUpdatedSubscribedChannels(status.error)
            }
            break;

          case botConstants.messages.updateMyChannels:
            const myChannels = text.split('\n')
            status = await this.commandsHandler.handleSaveMyChannels(myChannels)
            if (status.ok) {
              this.commandsHandler.sendSuccessfullyUpdatedMyChannels()
            } else {
              this.commandsHandler.sendErrorUpdatedMyChannels(status.error)
            }
            break;
        
          default:
            break;
        }

        return
      }

      switch (text) {
        case botConstants.commands.updateSubscribedChannels:
          this.commandsHandler.sendUpdateSubscribedChannels()
          break;

        case botConstants.commands.showSubscribedChannels:
          this.commandsHandler.sendSubscribedChannels()
          break;

        case botConstants.commands.updateMyChannels:
          this.commandsHandler.sendUpdateMyChannels()
          break;

        case botConstants.commands.showMyChannels:
          this.commandsHandler.sendMyChannels()
          break;

        case botConstants.commands.startWatcher:
          this.state.active = true;
          this.commandsHandler.startWatcherMessage()
          break;

        case botConstants.commands.stopWatcher:
          this.state.active = false;
          this.commandsHandler.stopWatcherMessage()
          break;
      
        default:
          break;
      }
    })
  }

  delay(s) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, 1000 * s);
    })
  }
}

class CommandsHandler {
  constructor(tgBot, dbClient, chatId) {
    this.tgBot = tgBot
    this.dbClient = dbClient
    this.chatId = chatId

    this.build()
  }

  async build() {
    this.db = await this.dbClient.db("tg_repost_bot")
  }

  async sendStartPageMsg() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.choseOption, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async stopWatcherMessage() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.stopWatcher, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async startWatcherMessage() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.startWatcher, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async sendUpdateSubscribedChannels() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.updateSubscribedChannels, 
      { parse_mode: 'HTML', reply_markup: JSON.stringify({ force_reply: true }) }
    )
  }

  async sendUpdateMyChannels() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.updateMyChannels, 
      { parse_mode: 'HTML', reply_markup: JSON.stringify({ force_reply: true }) }
    )
  }

  handleSaveSubcribedChannels(channels) {
    return new Promise(async (resolve) => {
      try {
        await this.db.collection("connections").findOneAndUpdate(
          { chatId: this.chatId },
          { $set: { "subscribedChannels": channels } }
        )
        resolve({ ok: true })
      } catch (error) {
        resolve({ ok: false, error: error })
      }
    })
  }

  handleSaveMyChannels(channels) {
    return new Promise(async (resolve) => {
      try {
        await this.db.collection("connections").findOneAndUpdate(
          { chatId: this.chatId },
          { $set: { "myChannels": channels } }
        )
        resolve({ ok: true })
      } catch (error) {
        resolve({ ok: false, error: error })
      }
    })
  }

  async sendSuccessfullyUpdatedSubscribedChannels() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.successfullyUpdateSubscribedChannels, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async sendErrorUpdatedSubscribedChannels(error) {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.errorUpdateSubscribedChannels + ' ' + error, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async sendSuccessfullyUpdatedMyChannels() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.successfullyUpdateMyChannels, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async sendErrorUpdatedMyChannels(error) {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.errorUpdateMyChannels + ' ' + error, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async sendSubscribedChannels() {
    const currentCcnnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
    const channels = currentCcnnection.subscribedChannels || []
    await this.tgBot.sendMessage(this.chatId, `Список отслеживаемых каналов:\n${channels.join('\n')} `, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }

  async sendMyChannels() {
    const currentCcnnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
    const channels = currentCcnnection.myChannels || []
    await this.tgBot.sendMessage(this.chatId, `Список моих каналов:\n${channels.join('\n')} `, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.startMarkup }
    )
  }
}