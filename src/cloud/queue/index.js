import { PubSub } from '@google-cloud/pubsub';

export default (config) => {
  const topics = {
    flextime: 'flextime',
    stats: 'stats',
    reports: 'reports',
  };
  const pubsubClient = new PubSub({
    projectId: config.projectId,
  });

  const enqueueFlexTimeRequest = (data) => pubsubClient
    .topic(topics.flextime).publish(Buffer.from(JSON.stringify(data)));

  const enqueueStatsRequest = (data) => pubsubClient
    .topic(topics.stats).publish(Buffer.from(JSON.stringify(data)));

  const enqueueReportsRequest = (data) => pubsubClient
    .topic(topics.reports).publish(Buffer.from(JSON.stringify(data)));

  return { enqueueFlexTimeRequest, enqueueStatsRequest, enqueueReportsRequest };
};
