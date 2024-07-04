import * as restate from "@restatedev/restate-sdk"
import * as tm from "./taskmanager" 
import * as slackbot from "./slackbot"
import * as chat from "./chat"
import * as msgstream from "./util/stream"

import { reminderTaskDefinition } from "./tasks/reminder";
import { flightPricesTaskDefinition } from "./tasks/flight_prices";

const mode = checkMode(process.argv[2]);

// (1) register the task types we have at the task manager
//     so that the task manager knows where to send certain commands to

tm.registerTaskWorkflow(reminderTaskDefinition);
tm.registerTaskWorkflow(flightPricesTaskDefinition)

// (2) build the endpoint with the core handlers for the chat

const endpoint = restate.endpoint()
    .bind(chat.chatSessionService)
    .bind(tm.workflowInvoker)

// (3) depending on the mode, add slackbot or shell poll services 

switch (mode) {
    case "SLACK":
        console.log("Running in Slack mode");
        endpoint.bindBundle(slackbot.services)
        chat.notificationHandler(slackbot.notificationHandler)
        break;
    case "STREAM":
        console.log("Running in Stream Subscriber mode");
        endpoint.bindBundle(msgstream.services);
        chat.broadcastHandler(streamWriter);
        break;
    case "LOG":
        // nothing to do
        break;
}

// start the defaut http2 server (alternatively export as lambda handler, http handler, ...)
endpoint.listen(9080);

// -------------------------------

function checkMode(arg: string | undefined) {
    const mode = (arg ?? "SHELL").toUpperCase();
    if (mode === "SLACK" || mode === "STREAM" || mode === "LOG") {
        return mode;
    } else {
        console.error("Unknown mode: " + arg);
        process.exit(1);
    }
}

async function streamWriter(ctx: restate.Context, session: string, msgs: string[]): Promise<void> {
    ctx.objectSendClient<msgstream.StreamService>({ name: "stream" }, session)
        .push({ entries: msgs });
}