import { Eta } from 'eta'

let eta

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

export async function render({ entity, runtime }) {
    const source = entity.layout.content ?? ''
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
