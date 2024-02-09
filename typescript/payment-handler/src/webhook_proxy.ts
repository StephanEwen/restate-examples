import express from "express";
import * as stripe_utils from "./stripe_utils";
import Stripe from "stripe";

const app = express();
app.post("/webhooks", express.raw({type: "application/json"}), async (request, response) => {
    const sig = request.headers["stripe-signature"];
    if (sig === undefined) {
        response.status(400).send("Missing 'stripe-signature' header.");
        return;
    }
  
    let event;
    try {
      event = stripe_utils.parseWebhookCall(request.body, sig);
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err}`);
      return;
    }
  
    if (event.type.startsWith("payment_intent")) {
       const paymentIntent = event.data.object as Stripe.PaymentIntent;
       await callRestate(paymentIntent.id, paymentIntent);
       
    } else {
        console.log(`Unhandled event type ${event.type}`);
    }

    response.status(200).json({received: true});
  });

app.listen(5050, () => console.log("Express listening at 5050"));

async function callRestate(key: string, request: object) {
    const url = "http://localhost:8080/webhooks/processWebhook";
    const body = JSON.stringify({ key, request });

    console.debug(`Making call to Restate at ${url}`);

    const httpResponse = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "idempotency-key": key
        },
        body,
    });

    const responseText = await httpResponse.text();
    console.log(`HTTP ${httpResponse.status} - ${responseText}`);
}
