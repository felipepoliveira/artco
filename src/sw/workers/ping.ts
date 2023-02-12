import { Ping, ServiceWatcherWorkerRequest, Warmup } from "../../artco.ts";
import { Clock } from "../../utils/clock.ts";

self.onmessage = (rawMsg) => {
    const msg =  rawMsg as MessageEvent<ServiceWatcherWorkerRequest>
    switch (msg.data.event) {
        case "ping": {

            const clock = new Clock();

            // call ping method
            clock.start();
            console.log("Ping")
            const elapsed = clock.stop();

            self.postMessage(new Ping({
                serviceIsAvailable : true,
                elapsedTimeInMillis : elapsed
            }))
            break;
        }
    }
}

self.postMessage(new Warmup(true));