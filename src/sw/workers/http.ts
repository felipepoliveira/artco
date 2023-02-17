import {Ping, PingPayload, ServiceWatcherWorkerRequest, Warmup} from "../../artco.ts";
import { Clock } from "../../utils/clock.ts";
import { HttpServiceWatcher } from "../service_watchers.ts";

interface HttpResponse {
    status : number
}

export class HttpPing extends Ping {

    response : HttpResponse;

    constructor(ping : PingPayload, response : HttpResponse) {
        super({
            ...ping
        })
        this.event = "ping";
        this.response = response;
    }
}

// async channel
self.onmessage = (rawMessage : MessageEvent<ServiceWatcherWorkerRequest>) => {

    switch (rawMessage.data.event) {
        case "ping" : {
            const httpServiceWatcher = rawMessage.data.source as HttpServiceWatcher;
            const clock = new Clock();
            clock.start();
            // Store the timeout controller ID if is it created
            let timeoutControllerId : number | undefined = undefined;
                
            // if the user defined an request timeout, produce an timeout observer to cancel the promise if it return nothing
            if (httpServiceWatcher.config.requestTimeoutMillis) {
                timeoutControllerId = setTimeout(() => {
                    //reject(new Error(`Request timed out after ${this.config.requestTimeoutMillis} milliseconds`))
                    self.postMessage(new Ping({
                        elapsedTimeInMillis : clock.stop(),
                        serviceIsAvailable : false,
                        reason : `Request timed out after ${httpServiceWatcher.config.requestTimeoutMillis} milliseconds`
                    }))
                }, httpServiceWatcher.config.requestTimeoutMillis);
            }

            // Make the HTTP request:
            // If the request is OK is will resolve into the request response
            // if the request failed it will reject the promise with the returned error from fetch
            // Finally, it will clear the timeout observer if is defined
            fetch(httpServiceWatcher.config.url, httpServiceWatcher.config.requestInit)
            .then(response => {
                //resolve(response);
                self.postMessage(
                    new HttpPing(
                        {
                            elapsedTimeInMillis : clock.stop(),
                            serviceIsAvailable : true,
                        }, 
                        {
                            status : response.status
                        }
                    )
                );
            })
            .catch(e => {
                const error = e as Error;
                self.postMessage(new Ping({
                    elapsedTimeInMillis : clock.stop(),
                    serviceIsAvailable : false,
                    reason : "Request thrown an error: " + error.message
                }))
            })
            .finally(() => {
                // clear the timeout if its is set
                if (timeoutControllerId) clearTimeout(timeoutControllerId);
            })
        }
    }

}


self.postMessage(new Warmup(true));