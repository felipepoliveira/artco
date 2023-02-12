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
}

/**
 * Interface used to build the configuration for Artco bot start method
 */
interface ArtcoStartupConfiguration {
    pingIntervalMillis : number;
    timeoutUntilFirstPing? : number;

}

export interface ServiceWatcherUsageConfig {
    evaluateIfServiceIsAvailableCallback? : EvaluateIfServiceIsAvailableCallback;
}

class ObservedServiceWatcher {
    source : ServiceWatcher;
    
    private _lastPingTimestampMillis : number = 0;

    private _isWarm : boolean = false;

    private _isAvailable : boolean = false;

    private _lastPingElapsedTimeInMilliseconds : number = 0;

    serviceWatcherUsageConfig : ServiceWatcherUsageConfig;

    constructor(source : ServiceWatcher, serviceWatcherUsageConfig : ServiceWatcherUsageConfig | undefined = undefined) {
        this.source = source;
        this.serviceWatcherUsageConfig = (serviceWatcherUsageConfig) ? serviceWatcherUsageConfig : {};
    }

    compute(data : Ping | Warmup) {
        if (data.event === "ping") {
            const ping = data as Ping;
            this._lastPingElapsedTimeInMilliseconds = ping.elapsedTimeInMillis;
            this._lastPingTimestampMillis = Date.now();
            this._isAvailable = 
                (this.serviceWatcherUsageConfig.evaluateIfServiceIsAvailableCallback) 
                ?  
                this.serviceWatcherUsageConfig.evaluateIfServiceIsAvailableCallback(ping)
                :
                ping.serviceIsAvailable;
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

interface OnServiceWatcherDestroyCallback {
    () : void
}

interface OnAvailabilityChange {
    (sw : ServiceWatcher, isAvailable : boolean, ping : Ping) : void;
}

interface OnPingCallback {
    (sw : ServiceWatcher, ping : Ping) : void;
}

interface OnWarmupCallback {
    (sw : ServiceWatcher, warmup : Warmup) : void;
}

export interface ArtcoEvents {
    onAvailabilityChange? : OnAvailabilityChange,
    onPingCallback? : OnPingCallback,
    onWarmupCallback? : OnWarmupCallback
}

interface EvaluateIfServiceIsAvailableCallback {
    (ping : Ping) : boolean;
}

/**
 * Bot implementation for service watchers
 */
export class Artco {

    /**
     * Array that stores all ServiceWatchers registered through the use function
     */
    private serviceWatchers : ServiceWatchersMap;

    /**
     * Store the ping interval identification number returned by the setInterval function
     */
    private pingIntervalId? : number;

    events : ArtcoEvents

    constructor() {
        this.serviceWatchers = {};
        this.events = {};
    }

    /**
     * Adds a ServiceWatcher to the Artco watchers list. 
     * All ServiceWatchers that are to be used in the application must be added using this method before calling the Artco.start() function
     * @param resource 
     */
    use(resource : ServiceWatcher, serviceWatcherUsageConfig : ServiceWatcherUsageConfig | undefined = undefined) {
        const observedServiceWatcher = new ObservedServiceWatcher(resource, serviceWatcherUsageConfig);
        this.serviceWatchers[resource.id] = observedServiceWatcher;

        // add on message event listener on worker
        resource.worker.onmessage = (rawMsg) => {
            const msg = rawMsg as MessageEvent<ServiceWatcherWorkerResponse>;
            switch (msg.data.event) {
                case "ping": {
                    const stateBeforePing = observedServiceWatcher.isAvailable;
                    const ping = msg.data as Ping;
                    observedServiceWatcher.compute(ping);
                    if (this.events) {
                        if (this.events.onPingCallback) this.events.onPingCallback(observedServiceWatcher.source, ping);
                        if (this.events.onAvailabilityChange && stateBeforePing !== observedServiceWatcher.isAvailable) this.events.onAvailabilityChange(observedServiceWatcher.source, observedServiceWatcher.isAvailable, ping);
                    }
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