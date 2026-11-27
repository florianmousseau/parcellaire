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
 * « 750106   AB0049 » : code departement, code direction, code commune,
 * prefixe de section, section, numero. Reconstruire le code INSEE depuis la
 * tete demande de savoir ou couper le departement, et la coupe n'est pas la
 * meme en metropole et outre-mer : c'est l'erreur que le premier releve du
 * 2026-09-07 a faite, et elle rendait un identifiant qui ne retombait sur
 * aucune parcelle. On lit donc la QUEUE, et l'INSEE vient de la commune de la
 * page.
 */

test('la queue porte le prefixe, la section et le numero', () => {
	assert.equal(parcelleDeclaree('750106   AB0049', '75106'), '75106000AB0049');
	// Paris l'ecrit deja en quatorze signes (11 quai de Conti, releve du 2026-11-27).
	assert.equal(parcelleDeclaree('75106000AB0049', '75106'), '75106000AB0049');
	assert.equal(parcelleDeclaree('940810   AB0123', '94081'), '94081000AB0123');
});

test('un prefixe de commune fusionnee est garde tel quel', () => {
	assert.equal(parcelleDeclaree('313950026AB0931', '31395'), '31395026AB0931');
});

test('une reference d une autre commune ne se rattache pas a la page', () => {
	assert.equal(parcelleDeclaree('940810   AB0123', '75106'), null);
	assert.equal(parcelleDeclaree('750107   AB0049', '75106'), null);
});

test('une forme qui n est pas une reference ne rend rien', () => {
	assert.equal(parcelleDeclaree('', '75106'), null);
	assert.equal(parcelleDeclaree('AB0049', '75106'), null);
	assert.equal(parcelleDeclaree(42, '75106'), null);
	assert.equal(parcelleDeclaree('750106   AB00', '75106'), null);
	// Sans commune, on ne fabrique pas d'identifiant.
	assert.equal(parcelleDeclaree('750106   AB0049', ''), null);
});

/*
 * CE QUE LES VOISINS DECLARENT. Rue de Saint-Pol a Fillievres, les 34 numeros
 * declarent chacun au moins une parcelle : A 0335 au 25, A 0654 au 25bis.
 */
const numeroDe = (id: string, numero: number, suffixe: string, parcelles: string[]): Numero => ({
	id,
	numero,
	suffixe,
	codePostal: '62770',
	point: { lon: 2.159348, lat: 50.321768 },
	parcelles
});
const VOIE = [
	numeroDe('62335_0200_00025', 25, '', ['623350000A0335']),
	numeroDe('62335_0200_00025_bis', 25, 'bis', ['623350000A0654']),
	numeroDe('62335_0200_00027', 27, '', ['623350000A0516'])
];

test('les parcelles des autres numeros excluent celles du numero vise', () => {
	assert.deepEqual(parcellesDesAutresNumeros(VOIE, '62335_0200_00025').toSorted(), [
		'623350000A0516',
		'623350000A0654'
	]);
});

test('un numero absent de la voie ne coupe rien', () => {
	// Sinon une adresse inconnue de la BAN verrait TOUTE la voie comme voisine
	// et perdrait ses secondaires sans qu aucune declaration le dise.
	assert.deepEqual(parcellesDesAutresNumeros(VOIE, '62335_0200_09999'), []);
});

test('une liste de numeros qui n est pas celle de ce paquet passe quand meme', () => {
	/*
	 * edifiable ecrit son point `[lon, lat]` et son code postal `string | null`.
	 * Exiger le type `Numero` entier l aurait force a recopier ces quatre
	 * lignes ; la fonction ne lit que l identifiant et les parcelles, elle ne
	 * demande donc que ca.
	 */
	const ailleurs = [
		{ id: 'a', parcelles: ['623350000A0335'], point: [-0.5, 47.4], codePostal: null },
		{ id: 'b', parcelles: ['623350000A0654'], point: [-0.5, 47.4], codePostal: null }
	];
	assert.deepEqual(parcellesDesAutresNumeros(ailleurs, 'a'), ['623350000A0654']);
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
					parcelles: ['490070   ZA0012', '490070000ZA0013']
				},
				{
					id: '49007_1234_00003',
					numero: 3,
					codePostal: '49000',
					position: { coordinates: [-0.552, 47.472] },
					parcelles: ['490070   ZA0003']
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
					parcelles: ['49007000ZA0003']
				},
				{
					id: '49007_1234_00012_bis',
					numero: 12,
					suffixe: 'bis',
					codePostal: '49000',
					point: { lon: -0.551, lat: 47.471 },
					parcelles: ['49007000ZA0012', '49007000ZA0013']
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
					geometry: { coordinates: [2.3466, 48.8462] },
					properties: {
						id: '75105_1234_00021',
						label: '21 Place du Pantheon 75005 Paris',
						type: 'housenumber',
						citycode: '75105',
						city: 'Paris',
						name: '21 Place du Pantheon',
						street: 'Place du Pantheon',
						housenumber: '21'
					}
				},
				{
					geometry: { coordinates: [2.3465, 48.8463] },
					properties: {
						id: '75105_1234',
						label: 'Place du Pantheon 75005 Paris',
						type: 'street',
						citycode: '75105',
						city: 'Paris',
						name: 'Place du Pantheon'
					}
				}
			]
		});
	}) as typeof fetch;
	try {
		const [adresse, rue] = await chercher('place du panthéon');
		assert.ok(demandees[0]?.includes('q=place%20du%20panth%C3%A9on'), String(demandees[0]));
		assert.deepEqual(adresse, {
			id: '75105_1234_00021',
			libelle: '21 Place du Pantheon 75005 Paris',
			type: 'housenumber',
			insee: '75105',
			commune: 'Paris',
			voie: 'Place du Pantheon',
			numero: '21',
			point: { lon: 2.3466, lat: 48.8462 }
		});
		assert.equal(rue?.id, '75105_1234');
		assert.equal(rue?.voie, 'Place du Pantheon');
		assert.equal(rue?.numero, '');
	} finally {
		globalThis.fetch = avant;
	}
});

/* Audit Codex du 2026-11-14 (angle 3), constats 2 et 4 : du point a la voie. */
async function avecAdresses<T>(
	features: unknown[],
	agir: () => Promise<T>
): Promise<{ rendu: T; url: URL }> {
	const avant = globalThis.fetch;
	const demandees: URL[] = [];
	globalThis.fetch = (async (url: string | URL) => {
		demandees.push(new URL(String(url)));
		return Response.json({ features });
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

test('la voie au point se tire de l adresse la plus proche, nommee par son arrondissement', async () => {
	const { rendu, url } = await avecAdresses(
		[
			{
				properties: {
					id: '75102_1234_00029',
					street: 'Rue de la Paix',
					citycode: '75102',
					city: 'Paris'
				}
			}
		],
		() => chercherVoieAuPoint(2.33, 48.87)
	);
	assert.equal(url.searchParams.get('lon'), '2.33');
	assert.equal(url.searchParams.get('lat'), '48.87');
	assert.deepEqual(rendu, {
		id: '75102_1234',
		nom: 'Rue de la Paix',
		insee: '75102',
		commune: 'Paris 2e Arrondissement'
	});
});

test('les voies voisines sont uniques et rangees par distance arrondie', async () => {
	const adresse = (id: string, street: string, distance: number) => ({
		properties: { id, street, distance }
	});
	const { rendu } = await avecAdresses(
		[
			adresse('94081_0002_00010', 'Rue B', 48.6),
			adresse('94081_0001_00003', 'Rue A', 12.4),
			adresse('94081_0002_00012', 'Rue B', 30.2)
		],
		() => voiesVoisines(2.39, 48.79)
	);
	assert.deepEqual(rendu, [
		{ id: '94081_0001', nom: 'Rue A', metres: 12 },
		{ id: '94081_0002', nom: 'Rue B', metres: 49 }
	]);
});
