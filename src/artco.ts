interface OnWarmupCallback {
    () : Promise<void>;
}

type ServiceWatcherWorkerEvents = "ping" | "warmup";

export interface ServiceWatcherWorkerResponse {
    event : ServiceWatcherWorkerEvents
}

export interface ServiceWatcherWorkerRequest {
    event : ServiceWatcherWorkerEvents,
    source : ServiceWatcher
}

export class Warmup implements ServiceWatcherWorkerResponse {
    isWarm : boolean;

    event : ServiceWatcherWorkerEvents = "warmup"

    constructor(isWarm : boolean) {
        this.isWarm = isWarm;
    }
}

export interface PingPayload {
    serviceIsAvailable : boolean;
    elapsedTimeInMillis : number;
    reason? : string;
}

export class Ping implements PingPayload, ServiceWatcherWorkerResponse{

    /**
     * Store the event type
     */
    event : ServiceWatcherWorkerEvents;

    /**
     * Indicates whether the service is still available
     */
    serviceIsAvailable : boolean;

    /**
     * The elapsed time to call the ping method
     */
    elapsedTimeInMillis : number;

    /**
     * The reason from the returned ping message. Generally use to identify errors or to 
     * specify success messages
     */
    reason? : string;

    constructor(config : PingPayload) {
        this.event = "ping";
        this.serviceIsAvailable = config.serviceIsAvailable;
        this.elapsedTimeInMillis = config.elapsedTimeInMillis;
        this.reason = config.reason;
    }
}

interface OnServiceWatcherDestroyCallback {
    () : void
}

interface OnAvailabilityChange {
    (ping : Ping) : void;
}

interface OnPingCallback {
    (ping : Ping) : void;
}

interface OnWarmupCallback {
    (warmup : Warmup) : void;
}

/**
 * 
 */
export class ServiceWatcher {
    id : string;
    /**
     * Runs the preconfigured function that checks if the service is online. 
     * This function returns an object of type Ping that contains data about the service verification. 
     */
    worker : Worker;

    /**
     * Store general service watcher configurations
     */
    constructor(
        id : string,
        worker : Worker,
        ) {
            this.id = id;
            this.worker = worker;

    }

    serviceIsAvailable(ping : Ping) : boolean {
        return ping.serviceIsAvailable;
    }
}

/**
 * Interface used to build the configuration for Artco bot start method
 */
interface ArtcoStartupConfiguration {
    pingIntervalMillis : number;
    timeoutUntilFirstPing? : number;

}

class ObservedServiceWatcher {
    source : ServiceWatcher;
    
    private _lastPingTimestampMillis : number = 0;

    private _isWarm : boolean = false;

    private _isAvailable : boolean = false;

    private _lastPingElapsedTimeInMilliseconds : number = 0;

    constructor(source : ServiceWatcher) {
        this.source = source;
    }

    compute(data : Ping | Warmup) {
        if (data.event === "ping") {
            const ping = data as Ping;
            this._lastPingElapsedTimeInMilliseconds = ping.elapsedTimeInMillis;
            this._lastPingTimestampMillis = Date.now();
            this._isAvailable = this.source.serviceIsAvailable(ping);
        }
        else if (data.event === "warmup") {
            const warmup = data as Warmup;
            this._isWarm = warmup.isWarm;
        }
    }

    get lastPingElapsedTimeInMilliseconds() : number {
        return this._lastPingElapsedTimeInMilliseconds;
    }

    get lastPingTimestampMillis() : number {
        return this.lastPingTimestampMillis;
    }

    get isAvailable() : boolean{
        return this._isAvailable;
    }

    get isWarm() : boolean {
        return this. _isWarm;
    }
}

/**
 * Official wrapper used inside the Artco bot to control all 
 * registered service watchers
 */
type ServiceWatchersMap = {
    [id : string] : ObservedServiceWatcher
}

/**
 * Bot implementation for service watchers
 */
export class Artco {

    /**
     * Array that stores all ServiceWatchers registered through the use function
     */
    serviceWatchers : ServiceWatchersMap;

    /**
     * Store the ping interval identification number returned by the setInterval function
     */
    pingIntervalId? : number;

    constructor() {
        this.serviceWatchers = {};
    }

    /**
     * Adds a ServiceWatcher to the Artco watchers list. 
     * All ServiceWatchers that are to be used in the application must be added using this method before calling the Artco.start() function
     * @param resource 
     */
    use(resource : ServiceWatcher) {
        const observedServiceWatcher = new ObservedServiceWatcher(resource);
        this.serviceWatchers[resource.id] = observedServiceWatcher;

        // add on message event listener on worker
        resource.worker.onmessage = (rawMsg) => {
            const msg = rawMsg as MessageEvent<ServiceWatcherWorkerResponse>;
            switch (msg.data.event) {
                case "ping": {
                    const stateBeforePing = observedServiceWatcher.isAvailable;
                    const ping = msg.data as Ping;
                    observedServiceWatcher.compute(ping);
                    // console.log("the ping object: ", ping);
                    // if (config) {
                    //     if (config.onPingCallback) console.log("Ping callback: ", ping) //config.onPingCallback(ping);
                    //     if (config.onAvailabilityChange && stateBeforePing !== observedServiceWatcher.isAvailable) console.log("Availability change callback: ", ping) //config.onAvailabilityChange(ping);
                    // }
                    break;
                }
                case "warmup" : {
                    const warmup = msg.data as Warmup;
                    observedServiceWatcher.compute(warmup);
                    break;
                }
            }
        }
    }

    triggerPingRequest() {
        for (const swId in this.serviceWatchers) {
            const sw = this.serviceWatchers[swId];

            // skip not warm services
            if (!sw.isWarm) {
                continue;
            }

            // create an ping request that will be sent to all service watchers
            const msg : ServiceWatcherWorkerRequest = {
                event : "ping",
                source : sw.source
            }
            
            // send a ping request to the service watcher worker
            sw.source.worker.postMessage(msg)
        }
    }

    start(config? : ArtcoStartupConfiguration) {
        // create an default configuration object instance
        let startupConfig : ArtcoStartupConfiguration = {
            pingIntervalMillis : 1000,
            timeoutUntilFirstPing : 0,
        }

        // include the selected configurations
        if (config) {
            startupConfig = {
                ...config
            }
        }

        if (config?.timeoutUntilFirstPing) console.log(`Artco will wait ${config.timeoutUntilFirstPing} milliseconds until the first ping request`);

        setTimeout(() => {

            this.triggerPingRequest();
            // timeout that will be used to trigger ping callback for all service watchers
            this.pingIntervalId = setInterval(() => {

                this.triggerPingRequest();           
                
            }, startupConfig.pingIntervalMillis);

        }, startupConfig.timeoutUntilFirstPing)
        
    }

    stop() {
        // stop the ping interval
        if (this.pingIntervalId) {
            clearInterval(this.pingIntervalId)
        }

        // terminal all service watcher workers
        for (const swId in this.serviceWatchers) {
            const sw = this.serviceWatchers[swId];
            sw.source.worker.terminate();
        }
    }

}

export default new Artco();