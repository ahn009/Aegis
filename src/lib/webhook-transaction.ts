import { Prisma } from "@prisma/client";
import { db } from "./db";

type WebhookKey = {
  organizationId: string;
  externalId: string;
  event: string;
  payload: Record<string, string>;
};

/** Commit the receipt only when its database effects commit. A retry can then
 * safely repeat a failed callback, while a completed callback is acknowledged. */
export async function processTwilioWebhook<T>(
  key: WebhookKey,
  apply: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ deduped: false; result: T } | { deduped: true }> {
  try {
    const result = await db.$transaction(async (tx) => {
      const receipt = await tx.webhookEvent.create({
        data: {
          organizationId: key.organizationId,
          provider: "twilio",
          externalId: key.externalId,
          event: key.event,
          payloadJson: JSON.stringify(key.payload),
          signatureValid: true,
        },
      });
      const value = await apply(tx);
      await tx.webhookEvent.update({ where: { id: receipt.id }, data: { processedAt: new Date() } });
      return value;
    });
    return { deduped: false, result };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.webhookEvent.findUnique({
        where: { organizationId_provider_externalId: { organizationId: key.organizationId, provider: "twilio", externalId: key.externalId } },
      });
      if (existing?.event === key.event && existing.processedAt) return { deduped: true };
    }
    throw error;
  }
}
