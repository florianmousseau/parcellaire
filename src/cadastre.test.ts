import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	decouperIdentifiant,
	feuilleAuPoint,
	parcelleAuPoint,
	rattacherLaParcelle,
	sectionLisible,
	type Parcelle,
	parcelleParIdentifiant
} from './cadastre.ts';

/*
 * UNE ADRESSE PORTE SOUVENT DEUX PARCELLES, et la page n'en servait qu'une
 * jusqu'au 2026-09-07. Le cas temoin est reel : pour la Monnaie de Paris,
 * 11 quai de Conti, le referentiel des batiments mesure AB 52 a 73,9 %, AB 49 a
 * 24,2 % et AB 5 a 0,14 %, et la Base Adresse Nationale declare AB 49 (releve du
 * 2026-11-27). Les deux
 * premieres sont les parcelles de l'adresse ; la troisieme est un debord.
 */
const parcelle = (idu: string, contenance: number): Parcelle => ({
	idu,
	section: idu.slice(8, 10),
	numero: idu.slice(10),
	prefixe: idu.slice(5, 8),
	contenance,
	insee: idu.slice(0, 5),
	commune: 'Paris',
	/* Un carre a une vingtaine de metres a l'est du point de l'adresse : ces
	   tests portent sur le CHOIX des parcelles, mais le repli par le bord
	   refuse au-dela de quarante metres, donc la geometrie doit rester
	   plausible. */
	contour: [
		[
			[2.3395, 48.8565],
			[2.3395, 48.857],
			[2.34, 48.857],
			[2.34, 48.8565],
			[2.3395, 48.8565]
		]
	]
});

/** La meme parcelle temoin, dans une autre commune. */
const parcelleDe = (idu: string, contenance: number, commune: string): Parcelle => ({
	...parcelle(idu, contenance),
	commune
});

const AB52 = parcelle('75106000AB0052', 8757);
const AB49 = parcelle('75106000AB0049', 1847);
const AB5 = parcelle('75106000AB0005', 821);
const AUTOUR = [AB52, AB49, AB5];
/* Ce que le referentiel rend au 11 : le seuil de `PART_MINIMALE` a deja ecarte
   AB 5, qui n'y figure donc plus. */
const BATIMENT = {
	lon: 2.338444,
	lat: 48.856461,
	parcelles: [
		{ idu: '75106000AB0052', part: 0.7391 },
		{ idu: '75106000AB0049', part: 0.2416 }
	]
};

test('une adresse rend TOUTES les parcelles que son batiment couvre', () => {
	const r = rattacherLaParcelle(null, AUTOUR, 2.3392, 48.8567, BATIMENT, ['75106000AB0049']);
	assert.equal(r?.parcelle.idu, '75106000AB0052');
	assert.equal(r?.par, 'batiment');
	assert.equal(r?.part, 0.7391);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['75106000AB0049']
	);
	assert.equal(r?.autres[0]?.declaree, true);
});

// 2026-11-13 (audit Codex) : un point pose sur une voie privee cadastree.
test('le point cede a la parcelle que la BAN declare ET que le batiment couvre', () => {
	const voie = parcelle('75106000AB0900', 640);
	const maison = { ...BATIMENT, parcelles: [{ idu: '75106000AB0052', part: 1 }] };
	const r = rattacherLaParcelle(voie, [...AUTOUR, voie], 2.3392, 48.8567, maison, [
		'75106000AB0052'
	]);
	assert.equal(r?.parcelle.idu, '75106000AB0052');
	assert.equal(r?.par, 'batiment');
	assert.equal(r?.part, 1);
	// Sans declaration, ou quand la BAN declare aussi la parcelle du point, le point reste.
	assert.equal(
		rattacherLaParcelle(voie, [...AUTOUR, voie], 2.3392, 48.8567, maison, [])?.par,
		'point'
	);
	assert.equal(
		rattacherLaParcelle(voie, [...AUTOUR, voie], 2.3392, 48.8567, maison, [
			'75106000AB0052',
			'75106000AB0900'
		])?.parcelle.idu,
		'75106000AB0900'
	);
});

test('la plus couverte passe en tete, quel que soit l ordre recu', () => {
	const inverse = { ...BATIMENT, parcelles: [...BATIMENT.parcelles].reverse() };
	const r = rattacherLaParcelle(null, AUTOUR, 2.3392, 48.8567, inverse, []);
	assert.equal(r?.parcelle.idu, '75106000AB0052');
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['75106000AB0049']
	);
});

test('la parcelle DECLAREE par la BAN entre meme si le batiment ne la couvre pas', () => {
	// Le referentiel ne connait que AB 52 ; la BAN nomme AB 49 pour ce numero.
	// C'est une declaration, pas une mesure de recouvrement : elle est gardee.
	const seule = { ...BATIMENT, parcelles: [{ idu: '75106000AB0052', part: 0.99 }] };
	const r = rattacherLaParcelle(null, AUTOUR, 2.3392, 48.8567, seule, ['75106000AB0049']);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['75106000AB0049']
	);
	assert.equal(r?.autres[0]?.part, null);
	assert.equal(r?.autres[0]?.declaree, true);
});

test('une parcelle que le voisinage cadastral ne porte pas ne se sert pas', () => {
	// On ne fabrique jamais une reference : sans contour ni contenance, la page
	// n'aurait rien a en dire, et une ligne creuse se lit comme une donnee.
	const r = rattacherLaParcelle(null, [AB52], 2.3392, 48.8567, BATIMENT, ['75106000ZZ9999']);
	assert.equal(r?.parcelle.idu, '75106000AB0052');
	assert.deepEqual(r?.autres, []);
});

test('le point de l adresse garde la main, et les autres parcelles suivent', () => {
	const r = rattacherLaParcelle(AB49, AUTOUR, 2.3392, 48.8567, BATIMENT, []);
	assert.equal(r?.parcelle.idu, '75106000AB0049');
	assert.equal(r?.par, 'point');
	assert.equal(r?.part, 0.2416);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['75106000AB0052']
	);
});

test('sans batiment ni declaration, le repli par le bord ne change pas', () => {
	const r = rattacherLaParcelle(null, [AB52], 2.3392, 48.8567, null, []);
	assert.equal(r?.par, 'bord');
	assert.equal(typeof r?.metres, 'number');
	assert.deepEqual(r?.autres, []);
});

test('aucune parcelle du tout rend null, jamais une reponse fabriquee', () => {
	assert.equal(rattacherLaParcelle(null, [], 2.3392, 48.8567, null, []), null);
});

test('un identifiant cadastral se decoupe en quatre', () => {
	assert.deepEqual(decouperIdentifiant('94081000BQ0134'), {
		insee: '94081',
		prefixe: '000',
		section: 'BQ',
		numero: '0134'
	});
});

test('une commune fusionnee porte un prefixe non nul', () => {
	assert.equal(decouperIdentifiant('31395123AB0001')?.prefixe, '123');
});

test('la Corse passe, ses codes portent une lettre', () => {
	assert.equal(decouperIdentifiant('2A004000AB0001')?.insee, '2A004');
});

test('ce qui n est pas un identifiant rend null', () => {
	// La longueur ne suffit pas : chaque morceau a sa forme.
	assert.equal(decouperIdentifiant('94081000BQ013'), null);
	assert.equal(decouperIdentifiant('94081000BQ01345'), null);
	assert.equal(decouperIdentifiant('94081000bq0134'), null);
	assert.equal(decouperIdentifiant(''), null);
	assert.equal(decouperIdentifiant('../../etc/passwd'), null);
});

/*
 * LE VOISIN N EST PAS UNE PARCELLE DE CETTE ADRESSE.
 *
 * Cas temoin, releve le 2026-11-27 : a la mairie de Fillievres, 25 rue de
 * Saint-Pol, le referentiel mesure A 335 a 90,81 % et A 654 a 9,19 %, et la
 * BAN declare A 0654 au 25bis. Les 9 % sont 4,7 m2 qui passent la limite -
 * le referentiel numerise le toit, le cadastre suit le mur.
 */
const A335 = parcelleDe('623350000A0335', 1270, 'Fillièvres');
const A654 = parcelleDe('623350000A0654', 529, 'Fillièvres');
const MAIRIE = {
	lon: 2.159267,
	lat: 50.321888,
	parcelles: [
		{ idu: '623350000A0335', part: 0.9081 },
		{ idu: '623350000A0654', part: 0.0919 }
	]
};

test('la parcelle que la BAN declare a un AUTRE numero est retiree', () => {
	const r = rattacherLaParcelle(
		null,
		[A335, A654],
		2.159348,
		50.321768,
		MAIRIE,
		['623350000A0335'],
		['623350000A0654']
	);
	assert.equal(r?.parcelle.idu, '623350000A0335');
	assert.deepEqual(r?.autres, []);
});

test('le cas fondateur survit : la BAN declare AB 49 au 11, elle reste', () => {
	// Les deux parcelles du cas temoin. AB 49 est declaree a CE
	// numero : la coupe l epargne, meme si un voisin la declare aussi.
	const r = rattacherLaParcelle(
		null,
		AUTOUR,
		2.3392,
		48.8567,
		BATIMENT,
		['75106000AB0049'],
		['75106000AB0049', '75106000AB0005']
	);
	assert.equal(r?.parcelle.idu, '75106000AB0052');
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['75106000AB0049']
	);
});

test('la principale n est jamais coupee, meme declaree ailleurs', () => {
	// La BAN nomme parfois une parcelle voisine quand le batiment est entier
	// sur une autre : une adresse qui perdrait sa principale ne rendrait
	// plus rien. La regle ne touche que les secondaires.
	const r = rattacherLaParcelle(
		null,
		[A335, A654],
		2.159348,
		50.321768,
		MAIRIE,
		[],
		['623350000A0335', '623350000A0654']
	);
	assert.equal(r?.parcelle.idu, '623350000A0335');
	assert.deepEqual(r?.autres, []);
});

test('sans liste de voisines, rien ne change', () => {
	const r = rattacherLaParcelle(null, [A335, A654], 2.159348, 50.321768, MAIRIE, []);
	assert.deepEqual(
		r?.autres.map((a) => a.parcelle.idu),
		['623350000A0654']
	);
});

test('une section a une lettre perd son zero de comblement', () => {
	// La source rend toujours deux signes : la section E arrive en `0E`, et
	// « 0E 12 » ne s'ecrit sur aucun plan.
	assert.equal(sectionLisible('0E'), 'E');
	assert.equal(sectionLisible('0A'), 'A');
	assert.equal(sectionLisible('AB'), 'AB');
	assert.equal(sectionLisible('ZC'), 'ZC');
	assert.equal(sectionLisible('BQ'), 'BQ');
});

test('une enveloppe sans features leve, une contenance absente reste inconnue', async () => {
	const avant = globalThis.fetch;
	const repondre = (corps: unknown) => {
		globalThis.fetch = (async () => Response.json(corps)) as typeof fetch;
	};
	try {
		repondre({ code: 400, message: 'geom invalide' });
		await assert.rejects(
			parcelleAuPoint(2.39, 48.79),
			/API Carto cadastre : reponse sans features/
		);
		repondre({ features: [] });
		assert.equal(await parcelleAuPoint(2.39, 48.79), null);
		repondre({ features: [{ properties: { idu: '94081000AB0001' }, geometry: null }] });
		assert.equal((await parcelleAuPoint(2.39, 48.79))?.contenance, null);
		repondre({
			features: [{ properties: { idu: '94081000AB0001', contenance: 412 }, geometry: null }]
		});
		assert.equal((await parcelleAuPoint(2.39, 48.79))?.contenance, 412);
	} finally {
		globalThis.fetch = avant;
	}
});

test('une panne de la source leve, seul un 404 dit la parcelle introuvable', async () => {
	const avant = globalThis.fetch;
	const repondre = (status: number) => {
		globalThis.fetch = (async () => new Response('', { status })) as typeof fetch;
	};
	try {
		repondre(503);
		await assert.rejects(parcelleParIdentifiant('94081000AB0001'), /HTTP 503/);
		repondre(429);
		await assert.rejects(parcelleParIdentifiant('94081000AB0001'), /HTTP 429/);
		repondre(404);
		assert.equal(await parcelleParIdentifiant('94081000AB0001'), null);
	} finally {
		globalThis.fetch = avant;
	}
});

test('la parcelle demandee se prend par son identifiant entier, meme seconde, sous la commune mere', async () => {
	const avant = globalThis.fetch;
	const demandees: URL[] = [];
	const trait = (idu: string, contenance: number) => ({
		properties: { idu, contenance },
		geometry: null
	});
	globalThis.fetch = (async (url: string | URL) => {
		demandees.push(new URL(String(url)));
		return Response.json({
			features: [trait('132020000C0059', 111), trait('132010000C0059', 222)]
		});
	}) as typeof fetch;
	try {
		const trouvee = await parcelleParIdentifiant('132010000C0059');
		assert.equal(trouvee?.idu, '132010000C0059');
		assert.equal(trouvee?.contenance, 222);
		const parametres = demandees[0]?.searchParams;
		assert.equal(parametres?.get('code_insee'), '13055');
		assert.equal(parametres?.get('section'), '0C');
		assert.equal(parametres?.get('numero'), '0059');
		assert.equal(await parcelleParIdentifiant('132030000C0059'), null);
	} finally {
		globalThis.fetch = avant;
	}
});

/* Audit Codex du 2026-11-14 (angle 3), constats 1 et 3 : le point envoye et ce qui en est lu. */
async function avecReponse<T>(
	corps: unknown,
	agir: () => Promise<T>
): Promise<{ rendu: T; url: URL }> {
	const avant = globalThis.fetch;
	const demandees: URL[] = [];
	globalThis.fetch = (async (url: string | URL) => {
		demandees.push(new URL(String(url)));
		return Response.json(corps);
	}) as typeof fetch;
	try {
		const rendu = await agir();
		const url = demandees[0];
		assert.ok(url);
		return { rendu, url };
	} finally {
		globalThis.fetch = avant;
	}
}

test('la parcelle au point envoie le point lui-meme et decode identifiant et contour', async () => {
	const anneau = [
		[2.4, 48.8],
		[2.401, 48.8],
		[2.401, 48.801],
		[2.4, 48.8]
	];
	const { rendu, url } = await avecReponse(
		{
			features: [
				{
					properties: { idu: '94081000AB0012', section: 'AB', numero: '0012', contenance: 412 },
					geometry: { type: 'Polygon', coordinates: [anneau] }
				}
			]
		},
		() => parcelleAuPoint(2.4, 48.8)
	);
	assert.match(url.pathname, /\/parcelle$/);
	assert.equal(url.searchParams.get('geom'), '{"type":"Point","coordinates":[2.4,48.8]}');
	assert.equal(rendu?.idu, '94081000AB0012');
	assert.equal(rendu?.insee, '94081');
	assert.deepEqual(rendu?.contour, [anneau]);
});

test('la feuille au point lit la division, et rend ses quatre champs sans repli', async () => {
	const { rendu, url } = await avecReponse(
		{ features: [{ properties: { section: 'AB', feuille: 3, echelle: '1000', edition: 7 } }] },
		() => feuilleAuPoint(2.4, 48.8)
	);
	assert.match(url.pathname, /\/division$/);
	assert.equal(url.searchParams.get('geom'), '{"type":"Point","coordinates":[2.4,48.8]}');
	assert.deepEqual(rendu, { section: 'AB', feuille: 3, echelle: '1000', edition: 7 });
});
