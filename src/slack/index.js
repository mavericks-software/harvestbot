import { of } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';

export default (config, http, responseUrl) => {
  const api = http(
    'https://slack.com/api',
    {
      Authorization: `Bearer ${config.slackBotToken}`,
    },
  );

  const getUserEmailForId = (userId) => api
    .getJson(`/users.info?user=${userId}`)
    .pipe(
      filter(({
        user: {
          deleted,
          is_restricted: isMultiChannelGuest,
          is_ultra_restricted: isSingleChannelGuest,
        },
      }) => !deleted && !isMultiChannelGuest && !isSingleChannelGuest),
      mergeMap(({ user: { profile: { email } } }) => of(email)),
    )
    .toPromise();

  const postResponse = (header, messageArray) => api
    .postJson(responseUrl, { text: header, attachments: messageArray ? [{ text: messageArray.join('\n') }] : [] })
    .toPromise();

  const postToChannel = (imId, userId, header, messages) => api
    .postJson('/chat.postEphemeral', {
      channel: imId,
      text: header,
      attachments: messages ? [{ text: messages.join('\n') }] : [],
      user: userId,
    }).toPromise();

  const postMessage = (userId, header, messages) => (responseUrl
    ? postResponse(header, messages)
    : postToChannel(config.notifyChannelId, userId, header, messages)
  );

  return {
    getUserEmailForId, postMessage,
  };
};
