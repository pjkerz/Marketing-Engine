import { Queue } from 'bullmq';
import { getBullRedis } from '../lib/redis';

let queues: Record<string, Queue> | null = null;

const QUEUE_NAMES = [
  'v2-resume-parse',
  'v2-profile-extract',
  'v2-content-score',
  'v2-content-dispatch',
  'v2-media-cleanup',
  'v2-provider-delete',
  'v2-email-upload',
  'v2-dashboard',
] as const;

export type QueueName = typeof QUEUE_NAMES[number];

export function getQueues(): Record<QueueName, Queue> {
  if (!queues) {
    const connection = getBullRedis();
    queues = Object.fromEntries(
      QUEUE_NAMES.map((name) => [
        name,
        new Queue(name, { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } }),
      ]),
    ) as Record<QueueName, Queue>;
  }
  return queues as Record<QueueName, Queue>;
}

export async function closeQueues(): Promise<void> {
  if (queues) {
    await Promise.all(Object.values(queues).map((q) => q.close()));
    queues = null;
  }
}
