const botConstants = {
  commands: {
    'showSubscribedChannels': 'Показать список отслеживаемых каналов',
    'updateSubscribedChannels': 'Обновить список отслеживаемых каналов',
    'showMyChannels': 'Показать список моих каналов',
    'updateMyChannels': 'Обновить список моих каналов',
    'startWatcher': 'Запустить отслеживание',
    'stopWatcher': 'Остановить отслеживание',
  },

  messages: {
    'choseOption': 'Выберите опцию:',
    'updateSubscribedChannels': 'Внесите список никнеймов каналов. Каждый никнейм на отдельной строке. Каналы должны быть публичными.',
    'successfullyUpdateSubscribedChannels': 'Список успешно обновлен.',
    'errorUpdateSubscribedChannels': 'Произошла ошибка.',
    'updateMyChannels': 'Внесите список никнеймов каналов. Каждый никнейм на отдельной строке.',
    'successfullyUpdateMyChannels': 'Список успешно обновлен.',
    'errorUpdateMyChannels': 'Произошла ошибка.',
    'stopWatcher': 'Отслеживание остановлено. Теперь новые посты не будут отображаться в чате.',
    'startWatcher': 'Отслеживание запущено.',
  },

  markups: {
    'startMarkup': {
      'keyboard': [
        [{ text: 'Показать список отслеживаемых каналов' }, { text: 'Обновить список отслеживаемых каналов' }],
        [{ text: 'Показать список моих каналов' }, { text: 'Обновить список моих каналов' }],
        [{ text: 'Запустить отслеживание' }, { text: 'Остановить отслеживание' }],
      ]
    }
  },

  mediaTypes: {
    'image/jpeg': 'photo',
    'video/mp4': 'video'
  }
}

export default botConstants