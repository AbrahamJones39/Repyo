import { db } from "@/lib/db";
import { GENERIC_NOTIFICATION } from "@/lib/security/audit";
import { realtimeBus } from "@/lib/routing-engine";
import type { Role } from "@prisma/client";

export const REPLY_MAX_LENGTH = 400;

export const REPLY_AUTHOR_SELECT = {
  id: true,
  name: true,
  role: true,
} as const;

export function normalizeReplyBody(raw: string) {
  const body = raw.trim().replace(/\s+/g, " ");
  if (!body) {
    throw new Error("Write a short note first");
  }
  if (body.length > REPLY_MAX_LENGTH) {
    throw new Error(`Notes can be up to ${REPLY_MAX_LENGTH} characters`);
  }
  return body;
}

export function serializeReply(reply: {
  id: string;
  body: string;
  createdAt: Date | string;
  author: { id: string; name: string; role: Role };
}) {
  return {
    id: reply.id,
    body: reply.body,
    createdAt:
      reply.createdAt instanceof Date
        ? reply.createdAt.toISOString()
        : reply.createdAt,
    author: reply.author,
  };
}

export async function listRequestReplies(requestId: string) {
  const replies = await db.requestReply.findMany({
    where: { requestId },
    include: { author: { select: REPLY_AUTHOR_SELECT } },
    orderBy: { createdAt: "asc" },
  });
  return replies.map(serializeReply);
}

export async function createRequestReply(params: {
  requestId: string;
  authorId: string;
  body: string;
  participants: Array<string | null | undefined>;
}) {
  const body = normalizeReplyBody(params.body);

  const reply = await db.requestReply.create({
    data: {
      requestId: params.requestId,
      authorId: params.authorId,
      body,
    },
    include: { author: { select: REPLY_AUTHOR_SELECT } },
  });

  const recipientIds = [
    ...new Set(
      params.participants.filter(
        (id): id is string => Boolean(id) && id !== params.authorId
      )
    ),
  ];

  if (recipientIds.length > 0) {
    await db.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        title: GENERIC_NOTIFICATION.requestReply.title,
        body: GENERIC_NOTIFICATION.requestReply.body,
        type: "REQUEST_REPLY",
        data: { requestId: params.requestId, replyId: reply.id },
      })),
    });
  }

  realtimeBus.emit("request:updated", { requestId: params.requestId });
  for (const userId of recipientIds) {
    realtimeBus.emit(`user:${userId}`, {
      type: "REQUEST_REPLY",
      requestId: params.requestId,
    });
  }

  return serializeReply(reply);
}
