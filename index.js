import dotenv from 'dotenv';
dotenv.config()
import TelegramBot from 'node-telegram-bot-api';
import { toHTML } from "@telegraf/entity";
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
    this.sendedPostMessages = [];
    this.currentEditingPostLink = null;
    this.currentPublishChannel = null;
    this.commandsHandler = new CommandsHandler(this.tgBot, this.dbClient, this.chatId)
    this.state = {
      page: 'startPage', // ['startPage', 'editPostPage', 'publishScreen']
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
    const postsToSend = posts.filter(post => !post.sended && !post.deleted)

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
          post.media.forEach((media) => {
            const type = botConstants.mediaTypes[media['type']];
            const url = media.url;
            
            const mediaObj = {
              type,
              media: url
            }
  
            mediaGroup.push(mediaObj)
          })
  
          const msg1 = await this.tgBot.sendMediaGroup(this.chatId, mediaGroup)
          this.sendedPostMessages.push(msg1)
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

          const msg2 = await this.tgBot.sendMessage(this.chatId, description,
            { parse_mode: 'HTML', 
              reply_markup: { 
                inline_keyboard: [
                  [{ text: 'Редактировать ✏️', callback_data: `edit_post::${post.link}` }, { text: 'Удалить ❌', callback_data: `delete_post::${post.link}` }],
                ], 
              } 
            } 
          )
          this.sendedPostMessages.push(msg2)
        } else {
          let description = post.description;
          description = description.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '');
          description = description.replaceAll('<br/>', '');
          description = description.replaceAll('<br />', '');
          description = description.replaceAll('</br>', '');
          description = description.replace(/<img[^>]*>/g, '');
          description = description.replace(/<a\s*[^>]*><\/a>/g, '');
          description = description.trim();
  
          const msg3 = await this.tgBot.sendMessage(this.chatId, description,
            { parse_mode: 'HTML', 
              reply_markup: { 
                inline_keyboard: [
                  [{ text: 'Редактировать ✏️', callback_data: `edit_post::${post.link}` }, { text: 'Удалить ❌', callback_data: `delete_post::${post.link}` }],
                ], 
              } 
            }
          )
          this.sendedPostMessages.push(msg3)
        }

        // await this.setPostIsSended(post)
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
            status = await this.handleSaveSubcribedChannels(subscribedChannels)
            if (status.ok) {
              this.commandsHandler.sendSuccessfullyUpdatedSubscribedChannels()
            } else {
              this.commandsHandler.sendErrorUpdatedSubscribedChannels(status.error)
            }
            break;

          case botConstants.messages.updateMyChannels:
            const myChannels = text.split('\n')
            status = await this.handleSaveMyChannels(myChannels)
            if (status.ok) {
              this.commandsHandler.sendSuccessfullyUpdatedMyChannels()
            } else {
              this.commandsHandler.sendErrorUpdatedMyChannels(status.error)
            }
            break;
        
          case botConstants.messages.editText:
            const formattedHTMLMsg = toHTML({ text: text, entities: message.entities || [] });
            status = await this.handleEditText(formattedHTMLMsg)
            if (status.ok) {
              await this.commandsHandler.sendSuccessfullyEditedText()
              await this.goToEditingScreen(this.currentEditingPostLink)
            } else {
              await this.commandsHandler.sendErrorEditedText(status.error)
            }
            break;

          default:
            break;
        }

        return
      }

      switch (text) {
        // start page
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

        // editing page
        case botConstants.commands.editText:
          await this.commandsHandler.sendEditTextMessage()
          break;

        case botConstants.commands.publishPost:
          await this.goToPublishScreen()
          break;

        // publishing page
        case botConstants.commands.publishNow:
          await this.handlePublishNow()
          break;

        case botConstants.commands.changePublishChannel:
          const myChanels = await this.getMyChannels();
          await this.sendMessageWithChoseChannel(myChanels);
          break;

        case botConstants.commands.back:
          switch (this.state.page) {
            case 'editPostPage':
              await this.goToStartScreen();
              break;

            case 'publishScreen':
              await this.goToEditingScreen(this.currentEditingPostLink);
              break;
          
            default:
              break;
          }
      
        default:
          break;
      }
    })

    this.tgBot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id
      const callbackData = query.data;

      if (this.chatId !== chatId) return

      const action = callbackData.split('::')[0]
      const data = callbackData.split('::')[1]

      switch (action) {
        case botConstants.commands.deletePost:
          await this.setPostIsDeleted(data);
          await this.deleteMessageFromChat(messageId);
          break;

        case botConstants.commands.editPost:
          this.goToEditingScreen(data)
          break;

        case botConstants.commands.chosePublishChannel:
          this.currentPublishChannel = data;
          await this.commandsHandler.sendPublishChannelChosen();
          break;
      
        default:
          break;
      }
    })
  }

  async handlePublishNow() {
    if (!this.currentPublishChannel) {
      const myChanels = await this.getMyChannels();
      await this.sendMessageWithChoseChannel(myChanels);
    } else {
      const result = await this.publishPostInMyChannel()
      if (result.ok) {
        await this.commandsHandler.sendSuccessfullyPublishPost();
        setTimeout(() => {
          this.goToStartScreen()
        }, 2000);
      } else {
        await this.commandsHandler.sendErrorPublishPost(result.error)
      }
    }
  }

  publishPostInMyChannel() {
    return new Promise(async (resolve, reject) => {
      const currentConnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
      const posts = currentConnection.posts;
      const post = posts.find(post => post.link == this.currentEditingPostLink)

      try {
        if (post.media.length) {
          const mediaGroup = [];
          post.media.forEach((media) => {
            const type = botConstants.mediaTypes[media['type']];
            const url = media.url;
            
            const mediaObj = {
              type,
              media: url
            }
  
            mediaGroup.push(mediaObj)
          })
  
          await this.tgBot.sendMediaGroup(`@${this.currentPublishChannel}`, mediaGroup)
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

          await this.tgBot.sendMessage(`@${this.currentPublishChannel}`, description, { parse_mode: 'HTML' })
        } else {
          let description = post.description;
          description = description.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '');
          description = description.replaceAll('<br/>', '');
          description = description.replaceAll('<br />', '');
          description = description.replaceAll('</br>', '');
          description = description.replace(/<img[^>]*>/g, '');
          description = description.replace(/<a\s*[^>]*><\/a>/g, '');
          description = description.trim();
  
          await this.tgBot.sendMessage(`@${this.currentPublishChannel}`, description, { parse_mode: 'HTML' })
        }

        resolve({ ok: true })
      } catch (error) {
        resolve({ ok: false, error })
      }
    })
  }

  handleEditText(newDesription) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.db.collection("connections").findOneAndUpdate(
          { chatId: this.chatId, "posts.link": this.currentEditingPostLink },
          { $set: { "posts.$.description": newDesription } }
        )
        resolve({ ok: true })
      } catch (error) {
        resolve({ ok: false, error: error })
      }
    })
  }

  async goToEditingScreen(data) {
    this.state.page = 'editPostPage'
    this.state.isSenderBlocked = true;
    this.currentEditingPostLink = data
    this.currentPublishChannel = null;
    await this.commandsHandler.sendEditPostMsg();
    await this.sendPostWithoutButtons(data, 'editPostMarkup')
  }

  async goToStartScreen() {
    this.state.page = 'startPage';
    this.state.isSenderBlocked = false;
    this.currentEditingPostLink = null;
    this.currentPublishChannel = null;
    await this.commandsHandler.sendStartPageMsg();
  }

  async goToPublishScreen() {
    this.state.page = 'publishScreen';
    this.state.isSenderBlocked = true;
    await this.commandsHandler.sendPublishPostMsg();
    await this.sendPostWithoutButtons(this.currentEditingPostLink, 'publishPostMarkup')
    const myChanels = await this.getMyChannels();
    await this.sendMessageWithChoseChannel(myChanels);
  }

  async sendMessageWithChoseChannel(channels) {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.choseChannelForPublish,
      { parse_mode: 'HTML', 
        reply_markup: { 
          inline_keyboard: [
            channels.map(channel => {
              return {
                text: channel,
                callback_data: `chose_publish_channel::${channel}`
              }
            })
          ], 
        } 
      }
    )
  }

  async getMyChannels() {
    const currentConnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
    const channels = currentConnection.myChannels || []
    return channels
  }

  sendPostWithoutButtons(link, markup) {
    return new Promise(async (resolve, reject) => {
      const currentConnection = await this.db.collection("connections").findOne({ chatId: this.chatId })
      const posts = currentConnection.posts;
      const post = posts.find(post => post.link == link)

      try {
        if (post.media.length) {
          const mediaGroup = [];
          post.media.forEach((media) => {
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
            { parse_mode: 'HTML', reply_markup: botConstants.markups[markup] } 
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
            { parse_mode: 'HTML', reply_markup: botConstants.markups[markup] }
          )
        }

        resolve(true)
      } catch (error) {
        resolve(true)
      }
    })
  }

  async setPostIsDeleted(link) {
    return new Promise(async (resolve, reject) => {
      await this.db.collection("connections").findOneAndUpdate(
        { chatId: this.chatId, "posts.link": link },
        { $set: { "posts.$.deleted": true } }
      )
      resolve(true)
    })
  }

  async deleteMessageFromChat(msgId) {
    let msgIndex;
    const msg = this.sendedPostMessages.find((msg, index) => {
      if (msg.message_id == msgId) {
        msgIndex = index;
        return true;
      } else {
        return false;
      }
    })

    if (msgIndex) {
      const previousMsg = this.sendedPostMessages[msgIndex - 1];
      if (Array.isArray(previousMsg)) {
        for (const prevMsg of previousMsg) {
          await this.tgBot.deleteMessage(this.chatId, prevMsg.message_id)
        }
        this.sendedPostMessages = this.sendedPostMessages.filter((_, index) => index !== msgIndex - 1);
      } else {
        if (!previousMsg?.reply_markup?.inline_keyboard) {
          await this.tgBot.deleteMessage(this.chatId, previousMsg.message_id)
          this.sendedPostMessages = this.sendedPostMessages.filter((_, index) => index !== msgIndex - 1);
        }
      }
    }

    this.sendedPostMessages = this.sendedPostMessages.filter(msg => msg.message_id !== msgId)

    return await this.tgBot.deleteMessage(this.chatId, msgId)
  }

  setPostIsSended(post) {
    return new Promise(async (resolve, reject) => {
      await this.db.collection("connections").findOneAndUpdate(
        { chatId: this.chatId, "posts.link": post.link },
        { $set: { "posts.$.sended": true } }
      )
      resolve(true)
    })
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

  async sendEditPostMsg() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.currentEditingPost)
  }

  async sendPublishPostMsg() {
    return await this.tgBot.sendMessage(this.chatId, botConstants.messages.currentPublishingPost, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.publishPostMarkup }
    )
  }

  async sendPublishChannelChosen() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.publishChannelChosen, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.publishPostMarkup }
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

  async sendEditTextMessage() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.editText, 
      { parse_mode: 'HTML', reply_markup: JSON.stringify({ force_reply: true }) }
    )
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

  async sendSuccessfullyPublishPost() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.successfullyPublishPost, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.publishPostMarkup }
    )
  }

  async sendErrorPublishPost(error) {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.errorPublishPost + ' ' + error, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.publishPostMarkup }
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

  async sendSuccessfullyEditedText() {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.successfullyEditedText, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.editPostMarkup }
    )
  }

  async sendErrorEditedText(error) {
    await this.tgBot.sendMessage(this.chatId, botConstants.messages.errorEditedText + ' ' + error, 
      { parse_mode: 'HTML', reply_markup: botConstants.markups.editPostMarkup }
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