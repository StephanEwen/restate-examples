import { connect } from "@restatedev/restate-sdk-clients"
import type { StreamPollService } from "./stream"

const sessionName = process.argv[2];
const RESTATE_URI = process.argv[3] ?? "http://localhost:8080";

if (!sessionName) {
    console.error(`Usage: ${process.argv[1]} <chat-session-name> [restate-uri]`);
    process.exit(1);
}

async function run() { 
    const restate = connect({ url: RESTATE_URI });
    const messageStream = restate.serviceClient<StreamPollService>({ name: "streamLongPoll" });

    const firstPoll = await messageStream.pollAll(sessionName);
    for (const msg of firstPoll.entries) {
        console.log(msg);
        console.log(" --------------------------------- ");
    }

    let offset = firstPoll.nextOffset;
    while (true) {
        const nextPoll = await messageStream.pollNext({ channel: sessionName, from: offset });
        for (const msg of nextPoll.entries) {
            console.log(msg);
            console.log(" --------------------------------- ");
        }
        offset = nextPoll.nextOffset;
    }
}

run()
  .catch(console.error);
