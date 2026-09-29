import { destroySession } from "@/lib/session";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

export const POST = withApi(async () => {
  await destroySession();
  return Response.json(ok({ loggedOut: true }));
});
