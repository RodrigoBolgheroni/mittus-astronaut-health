import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  now() {
    return new Date();
  }
  today() {
    return this.now().toISOString().slice(0, 10);
  }
}
