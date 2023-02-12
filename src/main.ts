import Artco, { ServiceWatcher } from "./artco.ts"
import { PingServiceWatcher } from "./sw/service_watchers.ts";

Artco.use(
    new PingServiceWatcher("Ping")
)

Artco.start({
    pingIntervalMillis : 3000,
    timeoutUntilFirstPing : 5000
});