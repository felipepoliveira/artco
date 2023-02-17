import { ServiceWatcher, ServiceWatcherConfig } from "../artco.ts";

/**
 * Service watcher created for tests purposes
 */
export class PingServiceWatcher extends ServiceWatcher {
    constructor(id : string, config? : ServiceWatcherConfig) {
        super(
            id,
            new Worker(new URL("workers/ping.ts", import.meta.url).href, { type: "module", name : "PingServiceWatcherWorker" }),
            config
            )
    }
}

interface HttpServiceWatcherConfig extends ServiceWatcherConfig {
    url : string;
    requestInit? : RequestInit;
    requestTimeoutMillis? : number;
}

export class HttpServiceWatcher extends ServiceWatcher {

    /**
     * URL that will be requested to test if HTTP service is up
     */
    config : HttpServiceWatcherConfig;

    constructor(id : string, config : HttpServiceWatcherConfig) {
        super(
            id,
            new Worker(new URL("workers/http.ts", import.meta.url).href, { type: "module", name : "HttpServiceWatcherWorker" }),
            config
        )

        this.config = config;
    }
}