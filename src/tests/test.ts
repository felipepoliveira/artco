import Artco from "../artco.ts";
import {HttpServiceWatcher} from "../sw/service_watchers.ts"
import { HttpPing } from "../sw/workers/http.ts";

let mockedAvailability = false;
Artco.use(
    new HttpServiceWatcher(
        "Google",
        {
            url : "https://www.google.com/",
        },
    ),
    {
        onStateChange : (sw, response) => {
            console.log(`O serviço ${sw.source.id} encontra-se: ${sw.state} and return reason ${response.reason}`);
        },
        onPing : (sw, ping) => {
            const httpPing = ping as HttpPing;
            console.log(`Recebendo um ping do serviço ${sw.source.id} com status ${httpPing.response.status}`)
        },
        timeout : 10000
    }
)

setInterval(() => {
    console.log(Artco.serviceWatchers);
}, 10000)



Artco.start();