import type { EventArguments, EventMap, EventTransport } from './index.js';

// The tracker reads attributes with `getAttribute`, so a number would arrive as a string
// HTML lowercases attribute names, so a camelCase key would arrive lowercased
// eslint-disable-next-line unicorn/prefer-smaller-scope -- a local type is spelled out in full in the emitted declarations
type AttributePayload<Payload> = Payload extends undefined
	? undefined
	: { [Key in keyof Payload]: Key extends Lowercase<Key & string> ? Payload[Key] & string : never };

export const umamiTransport: EventTransport = (name, data) => {
	(globalThis as { umami?: { track: EventTransport } }).umami?.track(name, data);
};

function getAttributes(name: string, data: Readonly<Record<string, string>> = {}) {
	const attributes: Record<string, string> = { 'data-umami-event': name };

	for (const [key, value] of Object.entries(data)) {
		attributes[`data-umami-event-${key}`] = value;
	}

	return attributes;
}

export function createUmamiAttributes<Events extends EventMap<Events>>() {
	function sendEventAttributes<Name extends keyof Events & string>(
		name: Name,
		...[data]: EventArguments<AttributePayload<Events[Name]>>
	) {
		return getAttributes(name, data);
	}

	function setSendEventAttributes<Name extends keyof Events & string>(
		element: Element,
		name: Name,
		...[data]: EventArguments<AttributePayload<Events[Name]>>
	) {
		for (const attribute of element.getAttributeNames()) {
			if (attribute.startsWith('data-umami-event-')) element.removeAttribute(attribute);
		}

		const attributes = Object.entries(getAttributes(name, data));

		for (const [attribute, value] of attributes) {
			element.setAttribute(attribute, value);
		}
	}

	return { sendEventAttributes, setSendEventAttributes };
}

export function recordTraversalPageviews() {
	let isTraversing = false;

	// The tracker learns the URL only from pushState and replaceState, which back and forward never call
	document.addEventListener('astro:before-swap', (event) => {
		isTraversing = 'navigationType' in event && event.navigationType === 'traverse';
	});

	document.addEventListener('astro:after-swap', () => {
		if (!isTraversing) return;

		history.replaceState(history.state, '', location.href);
	});
}
