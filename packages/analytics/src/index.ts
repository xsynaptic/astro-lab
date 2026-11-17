type EventValue = boolean | number | string;

// A bare mapped type passes primitives and arrays through and turns `object` into `{}`
type EventPayload<Data> =
	Data extends ReadonlyArray<unknown>
		? never
		: Data extends object
			? [keyof Data] extends [never]
				? never
				: { [Key in keyof Data]: EventValue }
			: never;

// Interfaces carry no implicit index signature, so the constraint refers to `Events` rather than a `Record`
export type EventMap<Events> = {
	[Name in keyof Events]: EventPayload<Events[Name]> | undefined;
};

export type EventArguments<Payload> = [Payload] extends [undefined]
	? []
	: undefined extends Payload
		? [data?: Payload]
		: [data: Payload];

export type EventTransport = (name: string, data?: unknown) => void;

export function createEventSender<Events extends EventMap<Events>>(transport: EventTransport) {
	// A union `name` checks `data` only against the union of its payloads
	function sendEvent<Name extends keyof Events & string>(
		name: Name,
		...[data]: EventArguments<Events[Name]>
	) {
		transport(name, data);
	}

	return { sendEvent };
}
