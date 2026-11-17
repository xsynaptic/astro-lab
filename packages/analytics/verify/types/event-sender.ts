// Checked by the type checker, not run; each `@ts-expect-error` fails the check once it stops applying
import { createEventSender } from '../../src/index.js';
import { createUmamiAttributes, umamiTransport } from '../../src/umami.js';

interface FixturePayload {
	label: string;
	tag?: string;
}

interface FixtureEvents extends Record<
	'fixture-optional-a' | 'fixture-optional-b',
	undefined | { count: number }
> {
	'fixture-bare': undefined;
	'fixture-camel': { isOpen: string };
	'fixture-count': { count: number; isDone: boolean };
	'fixture-interface': FixturePayload;
	'fixture-runtime': undefined | { mode: string };
}

const { sendEvent } = createEventSender<FixtureEvents>(umamiTransport);
const { sendEventAttributes, setSendEventAttributes } = createUmamiAttributes<FixtureEvents>();

sendEvent('fixture-bare');
sendEvent('fixture-camel', { isOpen: 'yes' });
sendEvent('fixture-count', { count: 1, isDone: false });
sendEvent('fixture-interface', { label: 'a' });
sendEvent('fixture-optional-a');
sendEvent('fixture-optional-b', { count: 1 });
sendEventAttributes('fixture-bare');
sendEventAttributes('fixture-interface', { label: 'a' });
sendEventAttributes('fixture-runtime');
setSendEventAttributes(document.body, 'fixture-runtime', { mode: 'dark' });

// @ts-expect-error unknown name
sendEvent('fixture-missing');
// @ts-expect-error data on a no-data event
sendEvent('fixture-bare', { count: 1 });
// @ts-expect-error missing data
sendEvent('fixture-count');
// @ts-expect-error wrong value type
sendEvent('fixture-count', { count: '1', isDone: false });
// @ts-expect-error excess property
sendEvent('fixture-interface', { label: 'a', other: 'b' });
// @ts-expect-error missing data on an attribute event
sendEventAttributes('fixture-interface');
// @ts-expect-error a camelCase attribute key, which HTML lowercases
sendEventAttributes('fixture-camel', { isOpen: 'yes' });
// @ts-expect-error a number in an attribute
sendEventAttributes('fixture-count', { count: 1, isDone: false });

// @ts-expect-error nested payload
createEventSender<{ nested: { inner: { value: string } } }>(umamiTransport);
// @ts-expect-error array payload
createEventSender<{ list: Array<string> }>(umamiTransport);
// @ts-expect-error primitive payload
createEventSender<{ primitive: string }>(umamiTransport);
// @ts-expect-error keyless payload, the branch that also rejects `{}`
createEventSender<{ keyless: object }>(umamiTransport);
// @ts-expect-error unknown values
createEventSender<{ loose: Record<string, unknown> }>(umamiTransport);
// @ts-expect-error a nested payload on the adapter's constraint
createUmamiAttributes<{ nested: { inner: { value: string } } }>();
