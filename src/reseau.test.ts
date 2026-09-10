import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lire, JOUR } from './reseau.ts';

/*
 * CE QUE CE BANC TIENT : qu'aucun appel sortant ne parte sans echeance.
 *
 * Un appel sans echeance ne tombe pas, il PEND, et il tient la page entiere.
 * Rien dans un type ni dans un lint ne voit un `signal` oublie - c'est une
 * option de plus dans un objet - donc c'est ici que ca se mesure.
 *
 * Le cache, lui, a ete accuse a tort le meme jour d'avoir fait perdre a une page
 * sa deuxieme parcelle : la remesure ne l'a jamais reproduit, et le commentaire
 * au-dessus de `cadastre.traits` raconte comment une seule observation a suffi
 * a designer la mauvaise cause. Le banc verifie donc qu'il est bien la.
 */

interface Options {
	readonly signal?: AbortSignal;
	readonly cf?: { readonly cacheEverything: boolean; readonly cacheTtl: number };
	readonly headers?: Record<string, string>;
}

/** Remplace `fetch` le temps d'un appel et rend les options qu'il a recues. */
async function optionsDe(appel: () => Promise<Response>): Promise<Options> {
	const vrai = globalThis.fetch;
	let vues: Options = {};
	globalThis.fetch = ((_url: string, options: Options) => {
		vues = options;
		return Promise.resolve(new Response('{}'));
	}) as typeof fetch;
	try {
		await appel();
	} finally {
		globalThis.fetch = vrai;
	}
	return vues;
}

test('un appel range au bord part avec une echeance ET son cache', async () => {
	const o = await optionsDe(() => lire('https://exemple.test/x', JOUR));
	assert.ok(o.signal instanceof AbortSignal, 'aucune echeance');
	assert.equal(o.signal?.aborted, false);
	assert.deepEqual(o.cf, { cacheEverything: true, cacheTtl: JOUR });
});

test('un appel annonce qui il est', async () => {
	const o = await optionsDe(() => lire('https://exemple.test/x', JOUR));
	assert.match(o.headers?.['User-Agent'] ?? '', /^aucadastre\//u);
});
