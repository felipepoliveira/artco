interface OnWarmupCallback {
    () : Promise<void>;
}

type ServiceWatcherWorkerEvents = "ping" | "warmup";

export interface ServiceWatcherWorkerResponse {
    event : ServiceWatcherWorkerEvents,
    reason? : string;
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

interface ServiceWatcherConfig {
    pingTimeoutMillis? : number;
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

    pingTimeoutMillis? : number;

    /**
     * Store general service watcher configurations
     */
    constructor(
        id : string,
        worker : Worker,
        config? : ServiceWatcherConfig

        ) {
            this.id = id;
            this.worker = worker;
            // add optional configuration
            if (config) {
                this.pingTimeoutMillis = config.pingTimeoutMillis;
            }

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
    onStateChange? : OnStateChange,
    onPing? : OnPingCallback,
    timeout : number;
}

type ObservedServiceWatcherStates = "NotAvailable" | "Available" | "Unstable"

class ObservedServiceWatcher {
    source : ServiceWatcher;
    
    private _lastPingTimestampMillis : number = 0;

    private _isWarm : boolean = false;

    private _isAvailable : boolean = true;

    private _lastPingElapsedTimeInMilliseconds : number = 0;

    private _state : ObservedServiceWatcherStates = "NotAvailable"

    serviceWatcherUsageConfig : ServiceWatcherUsageConfig;

    constructor(source : ServiceWatcher, serviceWatcherUsageConfig : ServiceWatcherUsageConfig | undefined = undefined) {
        this.source = source;
        this.serviceWatcherUsageConfig = (serviceWatcherUsageConfig) ? serviceWatcherUsageConfig : {
            timeout : 10000
        };
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
            this._state = (ping.serviceIsAvailable) ? "Available" : "NotAvailable";
        }
        else if (data.event === "warmup") {
            const warmup = data as Warmup;
            this._isWarm = warmup.isWarm;
            this._state = (warmup.isWarm) ? "Unstable" : "NotAvailable"
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

    get state() : ObservedServiceWatcherStates{
        return this._state;
    }
}

/**
 * Official wrapper used inside the Artco bot to control all 
 * registered service watchers
 */
type ObservedServiceWatchersMap = {
    [id : string] : ObservedServiceWatcher
}

interface OnServiceWatcherDestroyCallback {
    () : void
}

interface OnStateChange {
    (sw : ObservedServiceWatcher, response : ServiceWatcherWorkerResponse) : void;
}

interface OnPingCallback {
    (sw : ObservedServiceWatcher, ping : Ping) : void;
}

interface OnWarmupCallback {
    (sw : ObservedServiceWatcher, warmup : Warmup) : void;
}

export interface ArtcoEvents {
    onStateChange? : OnStateChange,
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
    private _serviceWatchers : ObservedServiceWatchersMap;

    /**
     * Store the ping interval identification number returned by the setInterval function
     */
    private pingIntervalId? : number;

    events : ArtcoEvents

    constructor() {
        this._serviceWatchers = {};
        this.events = {};
    }

    /**
     * Adds a ServiceWatcher to the Artco watchers list. 
     * All ServiceWatchers that are to be used in the application must be added using this method before calling the Artco.start() function
     * @param resource 
     */
    use(resource : ServiceWatcher, serviceWatcherUsageConfig : ServiceWatcherUsageConfig | undefined = undefined) {
        const observedServiceWatcher = new ObservedServiceWatcher(resource, serviceWatcherUsageConfig);
        this._serviceWatchers[resource.id] = observedServiceWatcher;

        // add on message event listener on worker
        resource.worker.onmessage = (rawMsg) => {
            const stateBeforePing = observedServiceWatcher.state;
            const msg = rawMsg as MessageEvent<ServiceWatcherWorkerResponse>;
            switch (msg.data.event) {
                case "ping": {
                    
                    const ping = msg.data as Ping;
                    observedServiceWatcher.compute(ping);

                    // trigger event callback for sw instance
                    if (observedServiceWatcher.serviceWatcherUsageConfig.onPing) observedServiceWatcher.serviceWatcherUsageConfig.onPing(observedServiceWatcher, ping);

                    // trigger event callback for Artco instance
                    if (this.events.onPingCallback) this.events.onPingCallback(observedServiceWatcher, ping);
                    break;
                }
                case "warmup" : {
                    const warmup = msg.data as Warmup;
                    observedServiceWatcher.compute(warmup);
                    break;
                }
            }

            // store flag indicating if the service watcher state changed
            const stateChanged = stateBeforePing !== observedServiceWatcher.state;

            // trigger event callback for sw instance
            if (observedServiceWatcher.serviceWatcherUsageConfig.onStateChange && stateChanged) {
                observedServiceWatcher.serviceWatcherUsageConfig.onStateChange(observedServiceWatcher, msg.data);
            }

            // trigger event callback for Artco instance
            if (this.events.onStateChange && stateChanged) {
                this.events.onStateChange(observedServiceWatcher, msg.data);
            } 
        }
    }

    /**
     * Send ping message to all registered ServiceWatchers mapped by this
     * artco instance. The ping message will only be sent if the service watcher
     * sent an afirmative warmup message
     */
    triggerPingRequest() {
        for (const swId in this._serviceWatchers) {
            const sw = this._serviceWatchers[swId];

            // skip not warm services
            // skip if the ping of the current sw is on timeout
            if (!sw.isWarm || sw.source.pingTimeoutMillis && 
                Date.now() - sw.lastPingTimestampMillis < sw.source.pingTimeoutMillis) {
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

    /**
     * Start Artco service watcher ping service
     * @param config 
     */
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

        // trigger ping requests on an defined interval
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
        for (const swId in this._serviceWatchers) {
            const sw = this._serviceWatchers[swId];
            sw.source.worker.terminate();
        }
    }

    get serviceWatchers() {
        const observedServiceWatchers : ObservedServiceWatcher[] = [];
        for (const swName in this._serviceWatchers) {
            observedServiceWatchers.push(this._serviceWatchers[swName]);
        }
        return observedServiceWatchers;
    }

}

export default new Artco();