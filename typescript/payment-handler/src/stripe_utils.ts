import { TerminalError } from "@restatedev/restate-sdk";
import Stripe from "stripe";

const stripeSecretKey = "";
const webHookSecret = "";

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

export function parseWebhookCall(requestBody: any, signature: string | string[]) {
    return stripe.webhooks.constructEvent(requestBody, signature, webHookSecret);
}

export async function createPaymentIntent(request: {
    paymentMethodId: string,
    amount: number,
    idempotencyKey: string,
    delayedStatus?: boolean
}): Promise<Stripe.PaymentIntent> {

    const requestOptions = {
        idempotencyKey: request.idempotencyKey
    }

    try {
        const paymentIntent: Stripe.PaymentIntent = await stripe.paymentIntents.create({
            amount: request.amount,
            currency: "usd",
            payment_method: request.paymentMethodId,
            confirm: true,
            confirmation_method: "automatic",
            return_url: "https://google.com/" // some random URL
        }, requestOptions);

        // simulate delayed notifications for testing
        if (request.delayedStatus) {
            paymentIntent.status = "processing";
        }
        return paymentIntent;
    }
    catch (error) {
        if (error instanceof Stripe.errors.StripeCardError) {
            // simulate delayed notifications for testing
            const paymentIntent = error.payment_intent;
            if (request.delayedStatus && paymentIntent) {
                paymentIntent.status = "processing";
                return paymentIntent;
             } else {
                throw new TerminalError(`Payment declined: ${paymentIntent?.status} - ${error.message}`);
             }
        } else {
            throw error;
        }
    }
}