import * as restate from "@restatedev/restate-sdk"

type Listener = {
    from: number,
    promise: string
}

type Poll = {
    entries: string[],
    nextOffset: number
}

const streamObject = restate.object({
    name: "stream",
    handlers: {
        push: async (ctx: restate.ObjectContext, msg: { entries: string[] } ) => {
            const entries = (await ctx.get<string[]>("entries")) ?? [];
            const newEntries = entries.concat(msg.entries);

            ctx.set("entries", newEntries);

            const listeners = (await ctx.get<Listener[]>("listeners")) ?? [];
            const remainingListeners = listeners.filter( (listener) => {
                if (newEntries.length > listener.from) {
                    ctx.resolveAwakeable(listener.promise, newEntries.slice(listener.from));
                    return false;
                } else {
                    return true;
                }
            });
            ctx.set("listeners", remainingListeners);
        },

        get: async (ctx: restate.ObjectContext, from: number): Promise<string[]> => {
            const entries = (await ctx.get<string[]>("entries")) ?? [];
            return from >= 0 && entries.length > from ? entries.slice(from): [];
        },

        poll: async (ctx: restate.ObjectContext, listener: Listener) => {
            if (!listener || !listener.promise || listener.from < 0) {
                throw new restate.TerminalError("invalid listener");
            }
            const listeners = (await ctx.get<Listener[]>("listeners")) ?? [];
            listeners.push(listener);
            ctx.set("listeners", listeners);
        }
    }
})

const streamLongPollService = restate.service({
    name: "streamLongPoll",
    handlers: {
        pollAll: async (ctx: restate.Context, channel: string): Promise<Poll> => {
            const entries = await ctx.objectClient(streamObject, channel).get(0);
            return { entries, nextOffset: entries.length };

        },
        pollNext: async (ctx: restate.Context, req: { channel: string, from: number }): Promise<Poll> => {
            const callback = ctx.awakeable<string[]>();

            ctx.objectSendClient(streamObject, req.channel).poll({ from: req.from, promise: callback.id })

            const entries = await callback.promise;
            return { entries, nextOffset: req.from + entries.length }
        }
    }
})

export type StreamService = typeof streamObject;
export type StreamPollService = typeof streamLongPollService;

export const services: restate.ServiceBundle = {
    registerServices(endpoint: restate.RestateEndpoint) {
        endpoint.bind(streamObject);
        endpoint.bind(streamLongPollService);
    }
}
