import Artco from "../artco.ts";
import {HttpServiceWatcher} from "../sw/service_watchers.ts"

let mockedAvailability = false;

setTimeout(() => mockedAvailability = true, 10000);

Artco.use(
    new HttpServiceWatcher(
        "Google",
        {
            url : "https://www.google.com/"
        }
    )
)

Artco.use(
    new HttpServiceWatcher(
        "Klaus Fiscal",
        {
            url : "https://www.klausfiscal.com.br/"
        }
    ),
    {
        evaluateIfServiceIsAvailableCallback : () => {
            return mockedAvailability;
        }
    }
)

Artco.events.onPingCallback = (sw, ping) => {
}

Artco.events.onAvailabilityChange = (sw, isAvailable) => {
    console.log(`O serviço ${sw.id} está disponível: ${isAvailable}`);
}



Artco.start();