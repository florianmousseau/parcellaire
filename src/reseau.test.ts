import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lire, lireSansCache, JOUR } from './reseau.ts';

/*
 * CE QUE CE BANC TIENT : qu'aucun appel sortant ne parte sans echeance.
 *
 * Un appel sans echeance ne tombe pas, il PEND, et il tient la page entiere.
 * Rien dans un type ni dans un lint ne voit un `signal` oublie - c'est une
 * option de plus dans un objet - donc c'est ici que ca se mesure.
 *
 * Et le cache est le SECOND point : `cacheEverything` a fait perdre a une page
 * d'edifiable sa deuxieme parcelle le 2026-09-10 (voir le commentaire au-dessus
 * de `cadastre.traits`). Les deux fonctions ne different que par lui, et un
 * banc qui ne le regarde pas laisserait la difference se refermer.
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

test('un appel sans cache garde son echeance, et ne porte AUCUN cf', async () => {
	const o = await optionsDe(() => lireSansCache('https://exemple.test/x'));
	assert.ok(o.signal instanceof AbortSignal, 'aucune echeance');
	assert.equal(o.cf, undefined);
});

test('les deux annoncent qui appelle', async () => {
	for (const appel of [
		() => lire('https://exemple.test/x', JOUR),
		() => lireSansCache('https://exemple.test/x')
	]) {
		const o = await optionsDe(appel);
		assert.match(o.headers?.['User-Agent'] ?? '', /^aucadastre\//u);
	}
});
