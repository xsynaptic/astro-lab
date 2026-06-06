# @xsynaptic/astro-build-logger

An [Astro][] integration that records how long each build takes and appends a structured entry to a [JSONL][] file. Each entry captures the build duration, page count, total output size, and the Astro and Node versions used, making it easy to track build performance over time.

_Note_: this package is ESM-only.

## Install

```sh
npm install @xsynaptic/astro-build-logger
```

## Use

Add the integration to your Astro config:

```ts
import buildLogger from '@xsynaptic/astro-build-logger';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [buildLogger()],
});
```

After each build, an entry is appended to `astro-build.jsonl` in the project root:

```text
{"timestamp":"2026-06-07T12:00:00.000Z","durationSeconds":42.5,"pageCount":1280,"outputBytes":83214946,"astroVersion":"6.4.4","nodeVersion":"22.22.2","summary":"42s (1280 pages, 79.4 MB)"}
```

One JSON object per line means the file is append-only and trivially parseable: read it line by line, or pipe it through tools like `jq`.

## Options

```ts
buildLogger({ logFileName: 'logs/build-times.jsonl' });
```

- `logFileName` (default `'astro-build.jsonl'`): path to the JSONL log file, resolved relative to the current working directory. Parent directories are not created automatically.

## License

[MIT][mit-license]

[astro]: https://astro.build
[jsonl]: https://jsonlines.org
[mit-license]: https://opensource.org/licenses/MIT
