import { auth } from "@/lib/auth";
import { realtimeBus } from "@/lib/routing-engine";
import { escalateMissedRequests } from "@/lib/escalation";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      send({ type: "connected", userId });

      void escalateMissedRequests().catch(() => undefined);

      const unsubUser = realtimeBus.subscribe(`user:${userId}`, send);
      const unsubGlobal = realtimeBus.subscribe("request:updated", send);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        void escalateMissedRequests().catch(() => undefined);
      }, 30000);

      const cleanup = () => {
        unsubUser();
        unsubGlobal();
        clearInterval(heartbeat);
      };

      request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
