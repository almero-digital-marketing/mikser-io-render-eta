import { Eta } from 'eta'
import path from 'node:path'

let eta

export function load({ runtime, options, config }) {
    if (!eta) {
        eta = new Eta({
            views: options.layoutsFolder,
            cache: !options.watch,
            ...config,
        })
    }
    runtime.eta = (name, data) => eta.render(name, data)
}

export async function render({ entity, options, runtime }) {
    const name = path.relative(options.layoutsFolder, entity.layout.uri).replace(/\.eta$/, '')
    try {
        return await runtime.eta(name, runtime)
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
