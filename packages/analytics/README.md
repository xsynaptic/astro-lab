# @xsynaptic/analytics

Typed analytics events. The core types a site's event map and hands each event to a provider's transport; `/umami` is the [Umami](https://umami.is) adapter.

```sh
npm install @xsynaptic/analytics
```

## Usage

```ts
import { createEventSender } from '@xsynaptic/analytics';
import { createUmamiAttributes, umamiTransport } from '@xsynaptic/analytics/umami';

interface AnalyticsEvents {
	'search-open': undefined;
	'search-query': { query: string; results: number };
}

export const { sendEvent } = createEventSender<AnalyticsEvents>(umamiTransport);
export const { sendEventAttributes, setSendEventAttributes } =
	createUmamiAttributes<AnalyticsEvents>();
```

```ts
sendEvent('search-query', { query: 'tea', results: 3 });
```

```astro
<button {...sendEventAttributes('search-open')} type="button">
	Search
</button>
```

A payload is a flat object of booleans, numbers and strings; an event without one is `undefined`. Attribute values are strings, since the tracker reads them with `getAttribute`. `setSendEventAttributes(element, name, data)` updates them at runtime.

Never put the attributes on an `<a>`: the tracker cancels a tracked link's click and assigns `location.href`, so `<ClientRouter />` never sees it. Call `sendEvent` from a click listener instead.

## Back and Forward under `<ClientRouter />`

The tracker learns the URL from `pushState` and `replaceState` only, so a router traversal records no pageview. Call this once from a `<script>`:

```ts
import { recordTraversalPageviews } from '@xsynaptic/analytics/umami';

recordTraversalPageviews();
```

## Playwright

```ts
import { createUmamiStub } from '@xsynaptic/analytics/umami/testing';

export const { getSentEvents, stubUmami } = createUmamiStub<AnalyticsEvents>();
```

`await stubUmami(page)` before navigating records every `sendEvent` call (attribute events go through the tracker itself and aren't recorded); `await getSentEvents(page, 'search-query')` returns them typed.
