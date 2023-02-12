import Artco, { Ping, ServiceWatcher } from "../artco.ts"
import { HttpServiceWatcher, PingServiceWatcher } from "../sw/service_watchers.ts";

//Artco.use(new PingServiceWatcher("Ping"))
const httpServiceWatcher = new HttpServiceWatcher("Example website", {
    url : "http://example.com"
});
Artco.use(httpServiceWatcher);

Artco.start({
    pingIntervalMillis : 3000,
    timeoutUntilFirstPing : 5000
});