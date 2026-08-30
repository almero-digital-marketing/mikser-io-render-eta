// What an eta template declares it needs.
//
// The layout contract is built from this: mikser_layouts_inspect asks each
// renderer what a template reads, so an editor can be told what a page wants
// before writing it. An engine that reports nothing makes every document a
// guess.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parseReferences } from '../index.js'

describe('what a template reads', () => {
    it('records an interpolated path', () => {
        assert.ok(parseReferences('<h1><%= it.title %></h1>').variables.includes('it.title'))
    })

    it('records a loop and its collection', () => {
        const r = parseReferences('<% for (const c of it.cases) { %><%= c.name %><% } %>')
        assert.deepEqual(r.iterations, [{ item: 'c', collection: 'it.cases' }])
        assert.ok(r.variables.includes('it.cases'))
    })

    it('records a partial and the arguments it is called with', () => {
        const r = parseReferences("<%~ include('ui/btn', { label: it.hero.cta }) %>")
        const btn = r.partials.find(p => p.name === 'ui/btn')
        assert.equal(btn.args.label, 'it.hero.cta')
        assert.ok(r.variables.includes('it.hero.cta'),
            'an argument is resolved in THIS template, so it is a read of this template too')
    })

    it('answers with the same shape for an unparseable template', () => {
        // A caller reading a contract must never have to branch on whether
        // the parse worked.
        const r = parseReferences('<% if ( %>')
        for (const key of ['variables', 'partials', 'iterations', 'assigns', 'optional']) {
            assert.ok(Array.isArray(r[key]), `${key} must still be an array`)
        }
    })
})

// A key the template proves it tolerates missing.
//
// Narrower than liquid's, and deliberately: liquid has an AST and can say that
// everything inside `{% if %}` is guarded. An eta execute block is arbitrary
// JavaScript with no AST, so inferring block structure by regex would be
// guessing at nesting. What IS unambiguous is the syntax whose whole purpose
// is tolerating absence.
describe('optional keys', () => {
    it('reads optional chaining as tolerating absence', () => {
        assert.ok(parseReferences('<img src="<%= it.hero?.image %>">').optional.includes('it.hero.image'))
    })

    it('reads a default as the fallback it is', () => {
        assert.ok(parseReferences("<%= it.subtitle ?? '' %>").optional.includes('it.subtitle'))
        assert.ok(parseReferences("<%= it.tagline || 'x' %>").optional.includes('it.tagline'))
    })

    it('leaves a plain read required', () => {
        // Erring toward required is the safe direction: it shows up as a gap
        // to check rather than a silence to trust.
        assert.deepEqual(parseReferences('<h1><%= it.title %></h1>').optional, [])
    })

    it('does not guess at if blocks', () => {
        // Deliberate. Without an AST the nesting cannot be established, and a
        // contract that invents a dependency is worse than one that omits it.
        // So a key guarded by `if` is reported as required — the safe error,
        // since it surfaces as a gap to check rather than a silence to trust.
        const r = parseReferences('<% if (it.hero) { %><%= it.hero.image %><% } %>')
        assert.deepEqual(r.optional, [])
        assert.ok(r.variables.includes('it.hero.image'), 'and the key is still reported as read')
    })

    it('does not report the condition of an execute block as a read', () => {
        // Not a decision, a limit: an execute block is arbitrary JavaScript
        // and only `for…of` and include() are extracted from it. Asserted so
        // the limit is visible rather than discovered by someone trusting a
        // contract to be complete.
        const r = parseReferences('<% if (it.showHero) { %>x<% } %>')
        assert.ok(!r.variables.includes('it.showHero'))
    })

    it('returns the field for an empty template, so no caller branches', () => {
        assert.deepEqual(parseReferences('').optional, [])
    })
})
