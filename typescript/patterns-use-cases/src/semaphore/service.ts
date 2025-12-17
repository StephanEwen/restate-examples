import { Context, service } from "@restatedev/restate-sdk";
import { limitHandler } from "./semaphore_client";

export const myService = service({
  name: "myService",
  handlers: {
    expensiveMethod: limitHandler(
      {
        id: "myService/expensiveMethod",
        concurrency: [
          {
            scope: "handler",
            key: (input) => `left:${input.left}`,
            limit: 2,
          }
        ],
      },
      async (ctx: Context, params: { left: number; right: number }) => {
        // very expensive - important that the semaphore protects this
        await ctx.sleep({ days: 1});
      }
    ),
  },
});

export type MyService = typeof myService;
