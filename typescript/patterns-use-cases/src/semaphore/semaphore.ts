import * as restate from "@restatedev/restate-sdk";
import { ObjectContext } from "@restatedev/restate-sdk";

const BATCH_SIZE = 200;

type CoreState = {
  count: number,
  limit: number,
  numWaiters: number,
  list_head: string | undefined,
  list_tail: string | undefined,
  tailSize: number // this number is approximate, because we may have removed waiters
}

type SemaphoreState = {
  state: CoreState,
  waiters: string[]
}

type LinkedBatchState = {
  waiters: string[],
  next: string | undefined
}

interface ReleaseRequest {
  awakeable?: string;
}

interface AcquireRequest {
  awakeable: string;
  limit: number;
}

export const semaphore = restate.object({
  name: "semaphore",
  handlers: {

    acquire: async (
      ctx: ObjectContext<SemaphoreState>,
      request: AcquireRequest
    ): Promise<boolean> => {

      const state = (await ctx.get("state")) ?? { count: 0, limit: 0, numWaiters: 0, list_head: undefined, list_tail: undefined, tailSize: 0 };
      state.limit = request.limit;

      // eager acquisition, when we are below the limit
      // this is the optimized part, because we want least overhead when we don't need to wait
      if (state.count < state.limit) {
        state.count++;
        ctx.set("state", state);
        ctx.resolveAwakeable(request.awakeable);
        return true;
      }

      // need to wait
      state.numWaiters++;

      // optimized case, fit into first batch
      if (state.list_tail === undefined && state.numWaiters <= BATCH_SIZE) {
        const waiters = (await ctx.get("waiters")) ?? [];
        waiters.push(request.awakeable);
        ctx.set("waiters", waiters);
        ctx.set("state", state);
        return false;
      }

      // fallback case: append to the linked batches
      // note - the comms with the tail are safe, because VO-to-VO messages
      // are guaranteed to be delivered in order
      if (!state.list_tail) {
        // create first linked batch
        const voId = `${ctx.key}-linked-${ctx.rand.uuidv4()}`;
        state.list_head = voId;
        state.list_tail = voId;
        state.tailSize = 0;
      }
      else if (state.tailSize >= BATCH_SIZE) {
        // new batch in linked list
        const nextTailId = `${ctx.key}-linked-${ctx.rand.uuidv4()}`;
        ctx.objectSendClient(semaphore, state.list_tail).setTailNext(nextTailId);
        state.list_tail = nextTailId;
        state.tailSize = 0;
      }

      state.tailSize++;
      ctx.set("state", state);
      ctx.objectSendClient(semaphore, state.list_tail).appendToTail(request.awakeable);
      return false;
    },

    releaseAcquired: async (ctx: ObjectContext<SemaphoreState>): Promise<void> => {

      const state = (await ctx.get("state"))!;
      state.count = Math.max(0, state.count - 1);
      if (state.numWaiters > 0) {
        await completeNextWaiters(ctx, state);
      }
      ctx.set("state", state);
    },

    cancelAcquire: async (ctx: ObjectContext<SemaphoreState>, awakeable: string): Promise<void> => {
      const state = await ctx.get("state")
      if (!state) {
        return;
      }

      const waiters = (await ctx.get("waiters")) ?? [];

      // see if we find this awakeable in the linked list
      let found: boolean;

      const index = waiters.indexOf(awakeable);
      if (index !== -1) {
        // found in first batch
        found = true;
        waiters.splice(index, 1);
        ctx.set("waiters", waiters);
      }
      else {
        // check linked batches
        if (state?.list_head) {
          found = await ctx.objectClient(semaphore, state.list_head).removeWaiter(awakeable);
        } else {
          found = false;
        }
      }

      if (found) {
        // found it as still awaiting acquisition
        state.numWaiters--;
      } else {
        // not found, so was already acquired
        await completeNextWaiters(ctx, state);
      }
      ctx.set("state", state);
    },

    // ---- methods for storing and updating awakable batches ----

    appendToTail: async (ctx: ObjectContext<LinkedBatchState>, awakeable: string) => {
      const waiters = (await ctx.get("waiters")) ?? [];
      waiters.push(awakeable);
      ctx.set("waiters", waiters);
    },

    setTailNext: async (ctx: ObjectContext<LinkedBatchState>, nextTailId: string) => {
      ctx.set("next", nextTailId);
    },

    popBatch: async (ctx: ObjectContext<LinkedBatchState>): Promise<LinkedBatchState> => {
      const waiters = (await ctx.get("waiters"))!;
      const next = (await ctx.get("next"))!;
      ctx.clearAll();
      return { waiters, next };
    },

    removeWaiter: async (ctx: ObjectContext<LinkedBatchState>, waiter: string): Promise<boolean> => {
      const waiters = (await ctx.get("waiters"))!;
      const index = waiters.indexOf(waiter);
      if (index !== -1) {
        waiters.splice(index, 1);
        ctx.set("waiters", waiters);
        return true;
      }

      const next = await ctx.get("next");
      if (next) {
        return await ctx.objectClient(semaphore, next).removeWaiter(waiter);
      } else {
        return false;
      }
    },
  },
  options: {
    idempotencyRetention: { hours: 0 },
    journalRetention: { hours: 0 },
    ingressPrivate: true,
  },
});

async function completeNextWaiters(ctx: ObjectContext<SemaphoreState>, state: CoreState): Promise<void> {
  let waiters = (await ctx.get("waiters")) ?? [];

  while (state.count < state.limit && state.numWaiters > 0) {
    const nextWaiter = waiters.shift();
    if (nextWaiter !== undefined) {
      // we can sometimes have an empty array, if we cancelled many acquisitions
      state.count++;
      state.numWaiters--;
      ctx.resolveAwakeable(nextWaiter);
    }

    // more waiters in the current batch
    if (waiters.length > 0) {
      continue;
    }

    // exhaused this batch, pull the next batch from the linked list, if available
    if (!state.list_head) {
      if (state.numWaiters > 0) {
        // should never happen, log this invariant violation
        ctx.console.warn(`No more waiters found, despite count being ${state.numWaiters}`);
      }
      break;
    }

    const batch = await ctx.objectClient(semaphore, state.list_head).popBatch();
    waiters = batch.waiters;
    if (batch.next) {
      state.list_head = batch.next;
    } else {
      state.list_head = undefined;
      state.list_tail = undefined;
      state.tailSize = 0;
    }
  }

  ctx.set("waiters", waiters);
}

export type Semaphore = typeof semaphore;
export const Semaphore: typeof semaphore = { name: "semaphore" }; 
