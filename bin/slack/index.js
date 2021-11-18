"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _rxjs = require("rxjs");

var _operators = require("rxjs/operators");

var _default = (config, http, responseUrl) => {
  const api = http('https://slack.com/api', {
    Authorization: `Bearer ${config.slackBotToken}`
  });

  const getUserEmailForId = userId => api.getJson(`/users.info?user=${userId}`).pipe((0, _operators.filter)(({
    user: {
      deleted,
      is_restricted: isMultiChannelGuest,
      is_ultra_restricted: isSingleChannelGuest
    }
  }) => !deleted && !isMultiChannelGuest && !isSingleChannelGuest), (0, _operators.mergeMap)(({
    user: {
      profile: {
        email
      }
    }
  }) => (0, _rxjs.of)(email))).toPromise();

  const postResponse = (header, messageArray) => api.postJson(responseUrl, {
    text: header,
    attachments: messageArray ? [{
      text: messageArray.join('\n')
    }] : []
  }).toPromise();

  const postToChannel = (imId, userId, header, messages) => api.postJson('/chat.postEphemeral', {
    channel: imId,
    text: header,
    attachments: messages ? [{
      text: messages.join('\n')
    }] : [],
    user: userId
  }).toPromise();

  const postMessage = (userId, header, messages) => responseUrl ? postResponse(header, messages) : postToChannel(config.notifyChannelId, userId, header, messages);

  return {
    getUserEmailForId,
    postMessage
  };
};

exports.default = _default;