export class Clock {

    startTimestampInMillis : number = 0;

    endTimestampInMillis : number = 0;

   start() {
    this.startTimestampInMillis = Date.now();
    this.endTimestampInMillis = this.startTimestampInMillis;
   }

   stop() : number {
    this.endTimestampInMillis = Date.now();
    return this.endTimestampInMillis - this.startTimestampInMillis;
   }
}