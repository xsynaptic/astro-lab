# @xsynaptic/unpic-imagor

An experimental [unpic](https://unpic.pics) provider for [imagor](https://github.com/cshum/imagor).

## Example

```ts
import { generate } from '@xsynaptic/unpic-imagor';

const path = generate('photo.jpg', { width: 800, quality: 80, format: 'webp' });
// => "unsafe/800x0/filters:quality(80):format(webp)/photo.jpg"
```

## Serving the output

imagor only serves a URL it can authorize. By default `generate` emits the `unsafe`
form, which the server accepts only when run with `IMAGOR_UNSAFE`. For production, run
imagor with `IMAGOR_SECRET` and sign the path yourself, passing `{ unsafe: false }` to
get the bare signable path:

```ts
const signable = generate('photo.jpg', { width: 800 }, { unsafe: false });
// => "800x0/photo.jpg"
// sign `signable`, then serve as `<baseURL>/<signature>/<signable>`
```
