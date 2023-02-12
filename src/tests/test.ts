import Artco from "../artco.ts";
import {HttpServiceWatcher} from "../sw/service_watchers.ts"

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
            return false;
        }
    }
)

Artco.events.onPingCallback = (sw, ping) => {
    console.log(`Recebendo um ping do serviço ${sw.id}: ${ping.serviceIsAvailable}`)
}

Artco.events.onAvailabilityChange = (sw, isAvailable) => {
    console.log(`O serviço ${sw.id} está disponível: ${isAvailable}`);
}



Artco.start();