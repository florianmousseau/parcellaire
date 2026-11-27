import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batimentDeLAdresse, CLE_BAN, parcellesRetenues, PART_MINIMALE } from './rnb.ts';

/*
 * LE SEUIL EST DERIVE, PAS CHOISI : releve du 2026-09-07 sur 72 adresses de six
 * communes, 140 couples batiment-parcelle. La distribution a deux bosses - 57
 * parcelles sous 0,8 % et 72 au-dessus de 5 %, onze entre les deux. Le cas
 * temoin est la Monnaie de Paris, 11 quai de Conti (releve du 2026-11-27) :
 * AB 52 73,9 %, AB 49 24,2 %, AB 5 0,14 %.
 */

const plots = [
	{ id: '75106000AB0049', bdg_cover_ratio: 0.2416 },
	{ id: '75106000AB0052', bdg_cover_ratio: 0.7391 },
	{ id: '75106000AB0005', bdg_cover_ratio: 0.0014 }
];

test('les parcelles sortent de la plus couverte a la moins couverte', () => {
	assert.deepEqual(
		parcellesRetenues(plots).map((p) => p.idu),
		['75106000AB0052', '75106000AB0049']
	);
});

test('un debord de trait est ecarte, une vraie parcelle est gardee', () => {
	// AB 5 porte 0,14 % du batiment : c'est un debord. AB 49 en porte 24,2 %,
	// et c'est bien une parcelle du 11 - la BAN la declare.
	const gardees = parcellesRetenues(plots).map((p) => p.idu);
	assert.ok(!gardees.includes('75106000AB0005'));
	assert.ok(gardees.includes('75106000AB0049'));
	assert.ok(PART_MINIMALE > 0.0014 && PART_MINIMALE <= 0.2416);
	// Les releves bornent aussi le seuil : les 57 debords du 2026-09-07 pesent
	// moins de 0,76 %, et la plus petite secondaire a garder du 2026-09-08 pese 5,1 %.
	assert.ok(PART_MINIMALE > 0.0076 && PART_MINIMALE <= 0.051);
});

test('une reponse sans parcelles n est pas une erreur', () => {
	// `plots` n'existe que si l'appel porte `withPlots=1`. Un champ absent rend
	// une liste vide, et l'appelant retombe sur la parcelle du point.
	assert.deepEqual(parcellesRetenues(undefined), []);
	assert.deepEqual(parcellesRetenues(null), []);
	assert.deepEqual(parcellesRetenues([]), []);
});

test('une entree sans identifiant ou sans part ne passe pas', () => {
	assert.deepEqual(parcellesRetenues([{ id: '', bdg_cover_ratio: 0.9 }]), []);
	assert.deepEqual(parcellesRetenues([{ id: '75106000AB0052' }]), []);
	assert.deepEqual(parcellesRetenues([{ id: '75106000AB0052', bdg_cover_ratio: '0.9' }]), []);
});

test('une part au-dela de 1 ou infinie ne passe pas devant une part reelle', () => {
	const gardees = parcellesRetenues([
		{ id: '75106000AB0999', bdg_cover_ratio: Number.POSITIVE_INFINITY },
		{ id: '75106000AB0998', bdg_cover_ratio: 1.5 },
		{ id: '75106000AB0052', bdg_cover_ratio: 0.74 },
		{ id: '75106000AB0049', bdg_cover_ratio: 1 }
	]);
	assert.deepEqual(
		gardees.map((p) => p.idu),
		['75106000AB0049', '75106000AB0052']
	);
});

/*
 * LA CORSE A DES LETTRES DANS SON CODE INSEE. Le motif precedent demandait
 * cinq chiffres, donc `2a004_0970_00001` - le 1 cours Napoleon a Ajaccio -
 * n'etait pas reconnu comme une cle. Un refus rend `null`, pas une erreur :
 * pas de batiment, pas de parts, et toute la Corse retombait sur « la parcelle
 * la plus proche ».
 *
 * Le banc existe parce qu'une regex qui perd un antislash reste valide et rend
 * `null` sur tout, en silence.
 */
test('une cle de Corse est une cle, une cle de metropole aussi', () => {
	assert.ok(CLE_BAN.test('2a004_0970_00001'));
	assert.ok(CLE_BAN.test('2B033_0010_00005'));
	assert.ok(CLE_BAN.test('75106_2296_00011'));
	// L'outre-mer est en chiffres, il passait deja.
	assert.ok(CLE_BAN.test('97209_1234_00007'));
	// Le suffixe fait partie de la cle : `..._00032_bis`.
	assert.ok(CLE_BAN.test('62335_0200_00025_bis'));
});

test('ce qui n est pas une cle est refuse', () => {
	assert.equal(CLE_BAN.test(''), false);
	assert.equal(CLE_BAN.test('abcde_0970_00001'), false);
	// Il n'y a que 2A et 2B : un departement en lettres ne s'invente pas.
	assert.equal(CLE_BAN.test('2C004_0970_00001'), false);
	assert.equal(CLE_BAN.test('75106_2296'), false);
});

const avecLaReponse = async (
	reponse: () => Response,
	suite: () => Promise<void>
): Promise<void> => {
	const avant = globalThis.fetch;
	globalThis.fetch = (async () => reponse()) as typeof fetch;
	try {
		await suite();
	} finally {
		globalThis.fetch = avant;
	}
};

test('UNE PANNE N EST PAS UNE ABSENCE : un referentiel muet leve, une adresse sans batiment rend null', async () => {
	await avecLaReponse(
		() => new Response('indisponible', { status: 503 }),
		async () => {
			await assert.rejects(batimentDeLAdresse('94081_7000_00012'), /HTTP 503/);
		}
	);
	await avecLaReponse(
		() => new Response('<html>', { status: 200 }),
		async () => {
			await assert.rejects(batimentDeLAdresse('94081_7000_00012'));
		}
	);
	await avecLaReponse(
		() => Response.json({ detail: 'Erreur interne' }),
		async () => {
			await assert.rejects(batimentDeLAdresse('94081_7000_00012'), /RNB : reponse sans results/);
		}
	);
	await avecLaReponse(
		() => Response.json({ results: [] }),
		async () => {
			assert.equal(await batimentDeLAdresse('94081_7000_00012'), null);
		}
	);
	await avecLaReponse(
		() => Response.json({ results: [null] }),
		async () => {
			assert.equal(await batimentDeLAdresse('94081_7000_00012'), null);
		}
	);
});

test('un batiment construit rend son point et ses parts, demande avec la cle entiere et withPlots', async () => {
	const avant = globalThis.fetch;
	const demandees: URL[] = [];
	globalThis.fetch = (async (url: string | URL) => {
		demandees.push(new URL(String(url)));
		return Response.json({
			results: [
				{ status: 'demolished', point: { coordinates: [1, 2] }, plots: [] },
				{ status: 'constructed', point: { coordinates: [2.338444, 48.856461] }, plots }
			]
		});
	}) as typeof fetch;
	try {
		const batiment = await batimentDeLAdresse('62335_0200_00025_bis');
		assert.equal(demandees[0]?.searchParams.get('cle_interop_ban'), '62335_0200_00025_bis');
		assert.equal(demandees[0]?.searchParams.get('withPlots'), '1');
		assert.deepEqual(batiment, {
			lon: 2.338444,
			lat: 48.856461,
			parcelles: [
				{ idu: '75106000AB0052', part: 0.7391 },
				{ idu: '75106000AB0049', part: 0.2416 }
			]
		});
	} finally {
		globalThis.fetch = avant;
	}
});
