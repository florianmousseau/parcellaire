import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	chercher,
	chercherVoieAuPoint,
	commune,
	parcelleDeclaree,
	parcellesDesAutresNumeros,
	voie,
	voiesVoisines,
	type Numero
} from './ban.ts';

/*
 * LA BAN ECRIT SES PARCELLES DANS LA FORME DES FICHIERS FONCIERS -
 * « 490353   AD0526 » : code departement, code direction, code commune,
 * prefixe de section, section, numero. Reconstruire le code INSEE depuis la
 * tete demande de savoir ou couper le departement, et la coupe n'est pas la
 * meme en metropole et outre-mer : c'est l'erreur que le premier releve du
 * 2026-09-07 a faite, et elle rendait un identifiant qui ne retombait sur
 * aucune parcelle. On lit donc la QUEUE, et l'INSEE vient de la commune de la
 * page.
 */

test('la queue porte le prefixe, la section et le numero', () => {
	assert.equal(parcelleDeclaree('490353   AD0526', '49353'), '49353000AD0526');
	assert.equal(parcelleDeclaree('940810   AB0123', '94081'), '94081000AB0123');
});

test('un prefixe de commune fusionnee est garde tel quel', () => {
	assert.equal(parcelleDeclaree('313950026AB0931', '31395'), '31395026AB0931');
});

test('une reference d une autre commune ne se rattache pas a la page', () => {
	assert.equal(parcelleDeclaree('940810   AB0123', '49353'), null);
	assert.equal(parcelleDeclaree('490354   AD0526', '49353'), null);
});

test('une forme qui n est pas une reference ne rend rien', () => {
	assert.equal(parcelleDeclaree('', '49353'), null);
	assert.equal(parcelleDeclaree('AD0526', '49353'), null);
	assert.equal(parcelleDeclaree(42, '49353'), null);
	assert.equal(parcelleDeclaree('490353   AD05', '49353'), null);
	// Sans commune, on ne fabrique pas d'identifiant.
	assert.equal(parcelleDeclaree('490353   AD0526', ''), null);
});

/*
 * CE QUE LES VOISINS DECLARENT. Rue de Letanduere a Angers, les 199 numeros
 * portent chacun UNE parcelle declaree : DM 0304 au 126, DM 0145 au 128.
 */
const numeroDe = (id: string, numero: number, parcelles: string[]): Numero => ({
	id,
	numero,
	suffixe: '',
	codePostal: '49000',
	point: { lon: -0.554296, lat: 47.458147 },
	parcelles
});
const VOIE = [
	numeroDe('49007_4790_00126', 126, ['49007000DM0304']),
	numeroDe('49007_4790_00128', 128, ['49007000DM0145']),
	numeroDe('49007_4790_00130', 130, ['49007000DM0147'])
];

test('les parcelles des autres numeros excluent celles du numero vise', () => {
	assert.deepEqual(parcellesDesAutresNumeros(VOIE, '49007_4790_00128').toSorted(), [
		'49007000DM0147',
		'49007000DM0304'
	]);
});

test('un numero absent de la voie ne coupe rien', () => {
	// Sinon une adresse inconnue de la BAN verrait TOUTE la voie comme voisine
	// et perdrait ses secondaires sans qu aucune declaration le dise.
	assert.deepEqual(parcellesDesAutresNumeros(VOIE, '49007_4790_09999'), []);
});

test('une liste de numeros qui n est pas celle de ce paquet passe quand meme', () => {
	/*
	 * edifiable ecrit son point `[lon, lat]` et son code postal `string | null`.
	 * Exiger le type `Numero` entier l aurait force a recopier ces quatre
	 * lignes ; la fonction ne lit que l identifiant et les parcelles, elle ne
	 * demande donc que ca.
	 */
	const ailleurs = [
		{ id: 'a', parcelles: ['49007000DM0145'], point: [-0.5, 47.4], codePostal: null },
		{ id: 'b', parcelles: ['49007000DM0304'], point: [-0.5, 47.4], codePostal: null }
	];
	assert.deepEqual(parcellesDesAutresNumeros(ailleurs, 'a'), ['49007000DM0304']);
});

test('UNE BOITE ABSENTE N EST PAS UN POINT : sans quatre nombres a leur place, la commune n a pas de centre', async () => {
	const avant = globalThis.fetch;
	const repondre = (displayBBox: unknown): void => {
		globalThis.fetch = (async () =>
			Response.json({ codeCommune: '94081', nomCommune: 'Vitry', displayBBox })) as typeof fetch;
	};
	try {
		repondre([2.36, 48.77, 2.42, 48.81]);
		const lue = await commune('94081');
		assert.ok(lue?.centre !== null && lue?.centre !== undefined);
		assert.ok(Math.abs(lue.centre.lon - 2.39) < 1e-9 && Math.abs(lue.centre.lat - 48.79) < 1e-9);
		for (const boite of [
			undefined,
			[],
			[2.36, 48.77, 2.42],
			['x', 2.36, 48.77, 2.42, 48.81],
			[2.36, null, 2.42, 48.81],
			[2.36, 48.77, Number.NaN, 48.81]
		]) {
			repondre(boite);
			assert.equal((await commune('94081'))?.centre, null, JSON.stringify(boite));
		}
	} finally {
		globalThis.fetch = avant;
	}
});

test('un 200 sans features est une panne, pas une recherche vide', async () => {
	const avant = globalThis.fetch;
	const repondre = (corps: unknown) => {
		globalThis.fetch = (async () => Response.json(corps)) as typeof fetch;
	};
	try {
		repondre({ message: 'contrat change' });
		await assert.rejects(chercher('rue de la paix'), /reponse sans features/);
		await assert.rejects(voiesVoisines(2.39, 48.79), /reponse sans features/);
		await assert.rejects(chercherVoieAuPoint(2.39, 48.79), /reponse sans features/);
		repondre(null);
		await assert.rejects(chercher('rue de la paix'), /reponse sans features/);
		repondre({ features: [] });
		assert.deepEqual(await chercher('rue de la paix'), []);
		assert.deepEqual(await voiesVoisines(2.39, 48.79), []);
		assert.equal(await chercherVoieAuPoint(2.39, 48.79), null);
	} finally {
		globalThis.fetch = avant;
	}
});

test('un 404 de la recherche reste une recherche vide', async () => {
	const avant = globalThis.fetch;
	globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
	try {
		assert.deepEqual(await chercher('rue de la paix'), []);
	} finally {
		globalThis.fetch = avant;
	}
});

// 2026-11-11 (audit Codex, angle 3) : aucune lecture reussie de `voie` ni de `chercher` n'etait tenue.
test('une voie lue en entier : numeros tries, suffixe, parcelles et cadre', async () => {
	const avant = globalThis.fetch;
	globalThis.fetch = (async () =>
		Response.json({
			idVoie: '49007_1234',
			nomVoie: 'Rue de la Mesure',
			position: { coordinates: [-0.55, 47.47] },
			displayBBox: [-0.56, 47.46, -0.54, 47.48],
			commune: { code: '49007', nom: 'Angers', departement: { nom: 'Maine-et-Loire' } },
			numeros: [
				{
					id: '49007_1234_00012_bis',
					numero: 12,
					suffixe: 'bis',
					codePostal: '49000',
					position: { coordinates: [-0.551, 47.471] },
					parcelles: ['490070   DM0145', '490070000DM0146']
				},
				{
					id: '49007_1234_00003',
					numero: 3,
					codePostal: '49000',
					position: { coordinates: [-0.552, 47.472] },
					parcelles: ['490070   DM0304']
				}
			]
		})) as typeof fetch;
	try {
		assert.deepEqual(await voie('49007_1234'), {
			id: '49007_1234',
			nom: 'Rue de la Mesure',
			point: { lon: -0.55, lat: 47.47 },
			cadre: { ouest: -0.56, sud: 47.46, est: -0.54, nord: 47.48 },
			commune: { insee: '49007', nom: 'Angers', departement: 'Maine-et-Loire' },
			numeros: [
				{
					id: '49007_1234_00003',
					numero: 3,
					suffixe: '',
					codePostal: '49000',
					point: { lon: -0.552, lat: 47.472 },
					parcelles: ['49007000DM0304']
				},
				{
					id: '49007_1234_00012_bis',
					numero: 12,
					suffixe: 'bis',
					codePostal: '49000',
					point: { lon: -0.551, lat: 47.471 },
					parcelles: ['49007000DM0145', '49007000DM0146']
				}
			]
		});
	} finally {
		globalThis.fetch = avant;
	}
});

test('une recherche reussie rend l adresse et la voie, et encode la saisie accentuee', async () => {
	const avant = globalThis.fetch;
	const demandees: string[] = [];
	globalThis.fetch = (async (entree: RequestInfo | URL) => {
		demandees.push(entree instanceof Request ? entree.url : String(entree));
		return Response.json({
			features: [
				{
					geometry: { coordinates: [-0.551, 47.471] },
					properties: {
						id: '49007_1234_00012',
						label: '12 Rue de l Eperon 49000 Angers',
						type: 'housenumber',
						citycode: '49007',
						city: 'Angers',
						name: '12 Rue de l Eperon',
						street: 'Rue de l Eperon',
						housenumber: '12'
					}
				},
				{
					geometry: { coordinates: [-0.55, 47.47] },
					properties: {
						id: '49007_1234',
						label: 'Rue de l Eperon 49000 Angers',
						type: 'street',
						citycode: '49007',
						city: 'Angers',
						name: 'Rue de l Eperon'
					}
				}
			]
		});
	}) as typeof fetch;
	try {
		const [adresse, rue] = await chercher('rue de l éperon');
		assert.ok(demandees[0]?.includes('q=rue%20de%20l%20%C3%A9peron'), String(demandees[0]));
		assert.deepEqual(adresse, {
			id: '49007_1234_00012',
			libelle: '12 Rue de l Eperon 49000 Angers',
			type: 'housenumber',
			insee: '49007',
			commune: 'Angers',
			voie: 'Rue de l Eperon',
			numero: '12',
			point: { lon: -0.551, lat: 47.471 }
		});
		assert.equal(rue?.id, '49007_1234');
		assert.equal(rue?.voie, 'Rue de l Eperon');
		assert.equal(rue?.numero, '');
	} finally {
		globalThis.fetch = avant;
	}
});
