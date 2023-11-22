import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const parseChannels = async (dbClient) => {
  const db = await dbClient.db("tg_repost_bot");
  const connections = await db.collection("connections").find({}).toArray()
  const channelsToParse = [];

  if (!connections || !connections?.length) {
    setTimeout(() => {
      parseChannels(dbClient)
    }, 1000 * 10);
    return
  }

  for (const connection of connections) {
    const subscribedChannels = connection.subscribedChannels || []

    subscribedChannels.forEach(channel => {
      if (!channelsToParse.includes(channel)) {
        channelsToParse.push(channel)
      }
    })
  }

  try {
    for (const channel of channelsToParse) {
      const response = await axios(`https://tg.i-c-a.su/rss/${channel}`)
      const data = response.data;
      const options = {
        ignoreAttributes: false,
      };
      const parser = new XMLParser(options);
      const json = parser.parse(data);
      const posts = json.rss.channel.item.map(post => {
        const link = post.link;
        let description = post.description
  
        const media = [];
  
        const enclosure = post.enclosure;
        if (Array.isArray(enclosure)) {
          enclosure.forEach(mediaItem => {
            media.push({
              url: mediaItem['@_url'],
              type: mediaItem['@_type'],
              length: mediaItem['@_length']
            })
          })
        } else if (enclosure) {
          media.push({
            url: enclosure['@_url'],
            type: enclosure['@_type'],
            length: enclosure['@_length']
          })
        }
  
        return {
          link,
          description,
          media,
          sended: false,
          deleted: false,
        }
      })
  
      for (const connection of connections) {
        const subscribedChannels = connection.subscribedChannels || []
        if (subscribedChannels.includes(channel)) {
          const currentPosts = connection.posts;
          const newPosts = posts.filter(post => {
            const isInCurrentPosts = currentPosts.find(i => i.link == post.link)
            if (isInCurrentPosts) {
              return false
            } else {
              return true
            }
          })

          for (const newPost of newPosts) {
            await db.collection("connections").findOneAndUpdate(
              { chatId: connection.chatId },
              { $push: { posts: newPost } }
            )
          }
        }   
      }

      await delay(10)
    }
  } catch (error) {
    console.log(error?.response?.statusText);
    setTimeout(() => {
      parseChannels(dbClient)
    }, 1000 * 30);
    return
  }

  setTimeout(() => {
    parseChannels(dbClient)
  }, 1000 * 10);
}

function delay (s) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, 1000 * s);
  })
}

export default parseChannels