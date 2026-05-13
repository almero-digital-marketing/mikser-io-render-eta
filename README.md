# mikser-io-render-eta

[Eta](https://www.npmjs.com/package/eta) renderer for [Mikser](https://github.com/almero-digital-marketing/mikser-io). Renders entities whose layout uses the `.eta` template engine.

## Install

```bash
npm install mikser-io-render-eta
```

## Usage

```js
// mikser.config.js
export default {
  renderer: 'eta',
  'render-eta': {
    autoEscape: true,
    autoTrim: ['slurp', 'nl']
  }
}
```

The `render-eta` config object is passed through to the Eta constructor — see [Eta config](https://eta.js.org/docs/api/configuration). `views` is set to the layouts folder and `cache` defaults to `true`.

Templates render against the full render runtime as the data context, so any function exposed on `runtime` by another render-* plugin is callable directly:

```eta
<h1><%= entity.meta.title %></h1>
<%~ markdown(entity.meta.body) %>
<%~ include('partials/footer') %>
```

## License

MIT
