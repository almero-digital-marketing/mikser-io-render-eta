import { Eta } from 'eta'
import { AsyncLocalStorage } from 'node:async_hooks'

let eta

// Per-render context propagated through Eta's async chain via Node's
// AsyncLocalStorage. The render() function below sets the context;
// the wrapped eta.render / eta.renderAsync (called by compiled
// templates for each include) read it back to report partial usage
// to the engine.
const renderContext = new AsyncLocalStorage()

function trackPartial(name) {
    const ctx = renderContext.getStore()
    if (!ctx?.track || !ctx.layouts || !name) return
    const layout = ctx.layouts[name]
    if (layout?.id) ctx.track.partial(layout.id)
}

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

        // Wrap Eta's per-invocation include resolution. Compiled
        // template bodies generate:
        //
        //   let include      = (t,d) => this.render(t, ...)
        //   let includeAsync = (t,d) => this.renderAsync(t, ...)
        //
        // and call them for each `<%~ include('name') %>` /
        // `<%~ includeAsync('name') %>` directive at render time —
        // even when the partial template itself is a cache hit.
        // Wrapping these captures partial usage per render invocation,
        // which is the right granularity: each entity using a partial
        // gets the dep edge recorded against its own snapshot.
        const originalRender = eta.render.bind(eta)
        eta.render = function (name, data, opts) {
            trackPartial(name)
            return originalRender(name, data, opts)
        }
        const originalRenderAsync = eta.renderAsync.bind(eta)
        eta.renderAsync = function (name, data, opts) {
            trackPartial(name)
            return originalRenderAsync(name, data, opts)
        }
    }
    runtime.eta = (source, data) => eta.renderString(source, data)
}

export async function render({ entity, runtime, state, track }) {
    const source = entity.layout.content ?? ''
    const layouts = state?.layouts?.layouts ?? {}
    try {
        // Establish the render context BEFORE evaluating the
        // template. Any internal include() / includeAsync() calls
        // inherit it through the async chain and report their partial
        // name to the engine's track via the wrapped methods above.
        return await renderContext.run(
            { track, layouts },
            () => runtime.eta(source, runtime),
        )
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

// Static reference scan for `mikser-io-layouts`'s inspect() primitive.
// Uses Eta's own tokenizer to walk a template source; surfaces what
// variables, partials, and iterations the source mentions. This is the
// authoring-time view; the runtime-precise answer (what the renderer
// actually touched per render) lives in mikser-io's manifest refClosure.
//
// Eta tokens:
//   string             plain text between tags
//   { t: 'i', val }    escaped interpolation:    <%= EXPR %>
//   { t: 'r', val }    unescaped interpolation:  <%~ EXPR %>
//   { t: 'e', val }    execute (arbitrary JS):   <% CODE %>
//
// `i`/`r` tokens are output expressions — extract the leading
// identifier path as a variable ref, plus surface include() /
// includeAsync() calls embedded in them. `e` tokens contain arbitrary
// JS, scanned by regex for `for (... of ...)` and the same include
// calls.
const ETA_IDENT_PATH = /([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/
export function parseReferences(source) {
    if (typeof source !== 'string' || !source) {
        return { variables: [], partials: [], iterations: [] }
    }
    let tokens
    try {
        const probe = new Eta({})
        tokens = probe.parse(source)
    } catch (err) {
        return { variables: [], partials: [], iterations: [], parseError: err.message }
    }

    const variables  = new Set()
    const partials   = new Set()
    const iterations = []

    function extractPath(expr) {
        const m = ETA_IDENT_PATH.exec(String(expr ?? '').trim())
        return m?.[1] ?? null
    }

    for (const tok of tokens) {
        if (typeof tok === 'string') continue
        const code = String(tok.val ?? '')

        if (tok.t === 'i' || tok.t === 'r') {
            // Output expression. Pull include() / includeAsync() calls
            // as partials first; if the whole expression IS such a call
            // skip variable extraction (the `include` ident isn't a
            // user variable, it's the engine's partial entrypoint).
            let isIncludeCall = false
            for (const m of code.matchAll(/\b(?:include|includeAsync)\s*\(\s*['"]([^'"]+)['"]/g)) {
                partials.add(m[1])
                isIncludeCall = true
            }
            if (!isIncludeCall) {
                const path = extractPath(code)
                if (path) variables.add(path)
            }
            continue
        }

        if (tok.t === 'e') {
            // Execute block — JS code. Surface for/of iterations and
            // any embedded include() / includeAsync() calls.
            for (const m of code.matchAll(/\bfor\s*\(?\s*(?:const|let|var)?\s*(\w+)\s+of\s+([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g)) {
                iterations.push({ item: m[1], collection: m[2] })
                variables.add(m[2])
            }
            for (const m of code.matchAll(/\b(?:include|includeAsync)\s*\(\s*['"]([^'"]+)['"]/g)) {
                partials.add(m[1])
            }
        }
    }

    return {
        variables:  Array.from(variables).sort(),
        partials:   Array.from(partials).sort(),
        iterations,
    }
}

// v9 factory — ADR-0010.
export function renderEta(options = {}) {
    return { name: options.name ?? 'eta', options, load, render, parseReferences }
}
