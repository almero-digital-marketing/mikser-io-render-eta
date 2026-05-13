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

export function render({ entity, options, runtime }) {
    const name = path.relative(options.layoutsFolder, entity.layout.uri).replace(/\.eta$/, '')
    return runtime.eta(name, runtime)
}
