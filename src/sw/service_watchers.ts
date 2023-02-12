import { ServiceWatcher } from "../artco.ts";

export class PingServiceWatcher extends ServiceWatcher {
    constructor(id : string) {
        super(
            id,
            new Worker(new URL("workers/ping.ts", import.meta.url).href, { type: "module", name : "PingWorker" }),
            )
    }
}