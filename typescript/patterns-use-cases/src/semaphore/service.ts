import * as restate from "@restatedev/restate-sdk";
import { serde } from "@restatedev/restate-sdk-zod";
import { z } from "zod";
import { limitHandler } from "./semaphore_client";

const Request = z.object({
  team: z.string(),
  user: z.string(),
  agentId: z.string(),
  prompt: z.string()
});
type Request = z.infer<typeof Request>;


export const myService = restate.service({
  name: "myService",
  handlers: {
    expensiveMethod: restate.createServiceHandler(
      {
        input: serde.zod(Request),
        output: serde.zod(z.void())
      },
      limitHandler(
        {
          id: "myService/expensiveMethod",
          concurrency: [
            {
              scope: "handler",
              key: (input) => input.agentId,
              limit: 2,
            },
            {
              scope: "handler",
              key: (input) => input.user,
              limit: 5,
            },
            {
              scope: "handler",
              key: (input) => input.team,
              limit: 100,
            }
          ],
        },
        async (ctx: restate.Context, request) => {
          // very expensive - important that the semaphore protects this
          await ctx.sleep({ days: 1});
        }
      )
    )
  }
});

export type MyService = typeof myService;
