const botConstants = {
  commands: {
    'showSubscribedChannels': 'Показать список отслеживаемых каналов',
    'updateSubscribedChannels': 'Обновить список отслеживаемых каналов',
    'showMyChannels': 'Показать список моих каналов',
    'updateMyChannels': 'Обновить список моих каналов',
    'startWatcher': 'Запустить отслеживание',
    'stopWatcher': 'Остановить отслеживание',
    'deletePost': 'delete_post',
    'deleteMediaItem': 'delete_media_item',
    'editPost': 'edit_post',
    'back': 'Назад',
    'editText': 'Редактировать текст',
    'publishPost': 'Опубликовать',
    'chosePublishChannel': 'chose_publish_channel',
    'addSubscribeChannel': 'add_subscribe_channel',
    'publishNow': 'Опубликовать сейчас',
    'changePublishChannel': 'Сменить канал публикации',
    'addSubcribe': 'Добавить подпись',
    'editMedia': 'Вставить/Удалить креатив',
  },

  messages: {
    'choseOption': 'Выберите опцию:',
    'updateSubscribedChannels': 'Внесите список никнеймов каналов. Каждый никнейм на отдельной строке. Каналы должны быть публичными.',
    'successfullyUpdateSubscribedChannels': 'Список успешно обновлен.',
    'errorUpdateSubscribedChannels': 'Произошла ошибка.',
    'updateMyChannels': 'Внесите список никнеймов каналов. Каждый никнейм на отдельной строке.',
    'successfullyUpdateMyChannels': 'Список успешно обновлен.',
    'errorUpdateMyChannels': 'Произошла ошибка.',
    'successfullyEditedText': 'Текст поста успешно обновлен.',
    'errorEditedText': 'Произошла ошибка.',
    'stopWatcher': 'Отслеживание остановлено. Теперь новые посты не будут отображаться в чате.',
    'startWatcher': 'Отслеживание запущено.',
    'currentEditingPost': 'Текущий пост для редактирования:',
    'editText': 'Отредактируйте текст и отправьте ответом на это сообщение.',
    'currentPublishingPost': 'Текущий пост для публикации:',
    'choseChannelForPublish': 'Выберете канал в который опубликуется пост:',
    'choseChannelForAddSubscribe': 'Выберете канал для добавления подписи:',
    'publishChannelChosen': 'Канал для публикации выбран. Теперь вы можете опубликовать пост.',
    'errorPublishPost': 'Ошибка публикации поста.',
    'successfullyPublishPost': 'Пост успешно опубликован.',
    'emptyMediaItems': 'В текущем посте нет медиа элементов. Для добавления отправьте мне фото/видео. Отправляйте по одному медиа-элементу.',
    'yourMediaItems': 'Список текущих медиа элементов:',
    'afterMediaItemsSended': 'Чтобы удалить медиа элемент нажмите кнопку под фото/видео. Для добавления отправьте мне фото/видео. Отправляйте по одному медиа-элементу.',
    'emptyPostError': 'В вашем посте не осталось ни медиа ни контента. Такой пост вы не сможете опубликовать(',
    'mediaItemDeleted': 'Медиа элемент успешно удален.'
  },

  markups: {
    'startMarkup': {
      'keyboard': [
        [{ text: 'Показать список отслеживаемых каналов' }, { text: 'Обновить список отслеживаемых каналов' }],
        [{ text: 'Показать список моих каналов' }, { text: 'Обновить список моих каналов' }],
        [{ text: 'Запустить отслеживание' }, { text: 'Остановить отслеживание' }],
      ]
    },

    'editPostMarkup': {
      'keyboard': [
        [{ text: 'CHAT GPT' }, { text: 'Редактировать текст' }],
        [{ text: 'Добавить подпись' }, { text: 'Вставить/Удалить креатив' }],
        [{ text: 'Опубликовать' }, { text: 'Назад' }],
      ]
    },

    'publishPostMarkup': {
      'keyboard': [
        [{ text: 'Опубликовать сейчас' }, { text: 'Отложить' }],
        [{ text: 'Сменить канал публикации' }, { text: 'Назад' }],
      ]
    },
  },

  mediaTypes: {
    'image/jpeg': 'photo',
    'video/mp4': 'video'
  }
}

export default botConstants