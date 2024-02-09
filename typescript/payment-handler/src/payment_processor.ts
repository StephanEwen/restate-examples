import * as restate from "@restatedev/restate-sdk";
import Stripe from "stripe";
import * as stripe_utils from "./stripe_utils";

//
// Call this with paymentMethodId
// - "pm_card_visa" for a successful payment
// - "pm_card_visa_chargeDeclined" for a declined payment
//

type PaymentRequest = {
    amount: number,
    paymentMethodId: string
    delayedStatus?: boolean
}

const paymentHandler = restate.router({

    processPayment: async (ctx: restate.RpcContext, request: PaymentRequest) => {
        verifyPaymentRequest(request);

        const idempotencyKey = ctx.rand.uuidv4();

        let paymentIntent = await ctx.sideEffect(() =>
            stripe_utils.createPaymentIntent({
                paymentMethodId: request.paymentMethodId,
                amount: request.amount,
                idempotencyKey,
                delayedStatus: request.delayedStatus
            })
        );

        if (paymentIntent.status === "processing") {
            // we listen to the webhook
            const webhookPromise = ctx.awakeable<Stripe.PaymentIntent>();
            await ctx.rpc(webhookTrackerApi).listenForWebhook(paymentIntent.id, webhookPromise.id);
            paymentIntent = await webhookPromise.promise;
        }

        switch (paymentIntent.status) {
            case "succeeded":
                return;
            case "requires_payment_method":
            case "canceled":
                throw new restate.TerminalError("Payment declined: " + paymentIntent.status);
            default:
                throw new restate.TerminalError("Unhandled status: " + paymentIntent.status);
        }
    }
});

const webhookTracker = restate.keyedRouter({

    processWebhook: async (ctx: restate.RpcContext, paymentIntentId: string, playload: Stripe.PaymentIntent) => {
        // is the payment handler waiting for the webhook already?
        const listener = await ctx.get<string>("listener");

        if (listener === null) {
            // not yet, hook came first, remember the value
            ctx.set("value", playload);
        } else {
            // we have a listener, let it know about the webhook payload
            ctx.resolveAwakeable(listener, playload);
            ctx.clear("listener");
        }
    },

    listenForWebhook: async (ctx: restate.RpcContext, paymentIntentId: string, listernerId: string) => {
        // do we have a value already?
        const value = await ctx.get("value");
        if (value === null) {
            // not yet, remember the listener
            ctx.set("listener", listernerId);
        } else {
            ctx.resolveAwakeable(listernerId, value);
            ctx.clear("value");
        }
    }

});

const paymentHandlerApi: restate.ServiceApi<typeof paymentHandler> = { path: "payments" };
const webhookTrackerApi: restate.ServiceApi<typeof webhookTracker> = { path: "webhooks" };

// the restate endpoint
restate.createServer()
    .bindRouter(paymentHandlerApi.path, paymentHandler)
    .bindKeyedRouter(webhookTrackerApi.path, webhookTracker)
    .listen(9080);

// ----------------------------- utils ----------------------------------------

function verifyPaymentRequest(request: PaymentRequest): void {
}
