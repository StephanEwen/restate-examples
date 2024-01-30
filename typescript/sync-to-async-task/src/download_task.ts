import * as restate from "@restatedev/restate-sdk";
import * as crypto from 'crypto';

const downloadService = restate.router({

    createArchive: async (ctx: restate.RpcContext, req: { archive: {}, email: string }): Promise<string> => {

        const taskId = ctx.rand.uuidv4();
        const taskPromise = ctx.rpc(taskAPI).build(taskId, req.archive);

        const timeout = ctx.sleep(5000);
        const result = await Promise.race([taskPromise, timeout]);

        if (typeof result === "string") {
            // got the URL as a response
            return result;
        }

        // else: got void as response, meaning a timeout. TODO, this can be nicer in the API
        ctx.send(taskAPI).redirectToEmail(taskId, { emailAddress: req.email });
        return "URL will be sent via email to: " + req.email;
    }
});


const task = restate.keyedRouter({

    build: async (ctx: restate.RpcContext, taskId: string, details: {}): Promise<string> => {
        // do some work:
        //  - extract some data
        //  - build an archive
        //  - upload to S3

        // for demo purposed, we wait anywhere between 0 and 20 seconds
        const workTime = ctx.rand.random() * 10;
        console.log(`Building the archive will take ${Math.floor(workTime)} seconds`);
        await ctx.sleep(workTime * 1000);
        
        const randomString = crypto.randomBytes(10).toString('hex');
        const downloadURL = `https://s3-eu-central-1.amazonaws.com/restatexamplebucket/${randomString}`;

        // remember this for later, in case the sync response here is not reveived any more
        ctx.set("url", downloadURL);

        return downloadURL;
    },
    
    redirectToEmail: async (ctx: restate.RpcContext, taskId: string, req: { emailAddress: string }) => {
        // this state will always be here, because this invocation
        // gets enqueued after the 'build()' call
        const downloadURL = await ctx.get<string>("url");
        console.log(`Sending email to ${req.emailAddress} with url ${downloadURL}`);
    },
})

const downloadsServiceAPI = { path: "download" } as restate.ServiceApi<typeof downloadService>;
const taskAPI = { path: "taskworker" } as restate.ServiceApi<typeof task>;

restate
    .createServer()
    .bindRouter(downloadsServiceAPI.path, downloadService)
    .bindKeyedRouter(taskAPI.path, task)
    .listen(55432);
