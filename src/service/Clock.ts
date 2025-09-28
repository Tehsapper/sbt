export interface Clock {
	// TODO: use better type for time that's not JS Date.
	getCurrentTime(): Date;
}

export class SystemClock implements Clock {
	getCurrentTime(): Date {
		return new Date();
	}
}
