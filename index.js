import { Eta } from 'eta'

let eta

// Match Eta's include directives in source: `<% include('name', …) %>`,
// `<%- include(...) %>`, `<%~ includeAsync(...) %>`, etc. The first string
// argument is the partial name as Eta sees it — a path relative to
// `views` (the layouts folder), without extension. That same identifier
// is what the layouts plugin uses as the in-memory map key, so we can
// look up the partial's catalog entity id directly.
const ETA_INCLUDE_RE = /<%[-~_=]?\s*include(?:Async)?\s*\(\s*['"`]([^'"`]+)['"`]/g

export function load({ runtime, options, config }) {
    if (!eta) {
        // `views` still points at the layouts folder so Eta's own
        // `<% include() %>` and `layout` directives can resolve
        // partials from disk. The top-level layout itself is rendered
        // from `entity.layout.content` (populated by the layouts
        // plugin and stripped of YAML by front-matter) — single source
        // of truth for layout bodies.
        eta = new Eta({
            views: options.layoutsFolder,
            cache: !options.watch,
            ...config,
        })
    }
    runtime.eta = (source, data) => eta.renderString(source, data)
}

export async function render({ entity, runtime, state, track }) {
    const source = entity.layout.content ?? ''
    // Report partial-edge deps to the engine BEFORE running the template
    // so a render error doesn't lose the tracking. The layouts plugin
    // exposes its name → entity map at `state.layouts.layouts`; we
    // resolve each include's name to the corresponding catalog id.
    if (track && state?.layouts?.layouts) {
        const layouts = state.layouts.layouts
        const seen = new Set()
        for (const match of source.matchAll(ETA_INCLUDE_RE)) {
            const name = match[1]
            if (seen.has(name)) continue
            seen.add(name)
            const layout = layouts[name]
            if (layout?.id) track.partial(layout.id)
        }
    }
    try {
        return await runtime.eta(source, runtime)
    } catch (err) {
        // Eta attaches the template `path` and (for compile errors) a line
        // pulled out of the error message; surface them in the format the
        // engine logger expects.
        err.layoutUri ??= entity.layout.uri
        const match = typeof err.message === 'string' && err.message.match(/at line (\d+)/i)
        if (match && err.line == null) err.line = Number(match[1])
        throw err
    }
}
