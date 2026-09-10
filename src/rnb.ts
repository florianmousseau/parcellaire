/*
 * LE BATIMENT DE CETTE ADRESSE, au Referentiel National des Batiments.
 *
 * POURQUOI UNE SOURCE DE PLUS ALORS QUE LE BATI EST DEJA LA. `lib/bati.ts` sert
 * la BD TOPO : elle porte la forme, la hauteur et les etages, et elle ne porte
 * AUCUNE adresse. Elle sait donc dessiner les batiments d'un pate de maisons,
 * jamais dire lequel est le numero 60. Le RNB, lui, est bati sur ce lien-la :
 * il rend un batiment PAR CLE D'ADRESSE.
 *
 * CE QUE CA REPARE, mesure le 2026-09-06 au 60 rue Pasteur a Vitry-sur-Seine.
 * Le point d'une adresse est un point d'ENTREE, pose sur la voie, et le domaine
 * public n'est pas cadastre : aucune parcelle ne le contient. La page nommait
 * alors la parcelle la plus proche, et se trompait de parcelle - E 185, 234 m2,
 * quand le batiment du 60 est sur E 107, 372 m2. Demander le batiment de
 * l'adresse, puis la parcelle qui le porte, repond a la question que le lecteur
 * pose vraiment : « ce terrain-la, c'est quoi ».
 *
 * LA CLE EST DEJA DANS NOS MAINS, ET C'EST CE QUI REND L'APPEL EXACT. Le RNB
 * accepte `cle_interop_ban`, et `Numero.id` de `lib/ban.ts` EST cette cle
 * (`94081_7125_00060`, suffixe compris : `..._00032_bis`). Aucun appariement de
 * texte, aucun rectangle a fouiller, aucune adresse a rapprocher - donc aucun
 * des pieges d'appariement que ce depot paie ailleurs.
 *
 * ON NE GARDE QUE `constructed`. Le referentiel porte aussi les projets de
 * construction et les demolitions : rattacher une adresse a la parcelle d'un
 * batiment demoli serait pire que de ne rien dire, et la page a une reponse de
 * repli qui, elle, est vraie.
 *
 * ============================================================================
 * IL REND AUSSI LES PARCELLES DU BATIMENT, ET LA PART POSEE SUR CHACUNE
 * ============================================================================
 *
 * Florian, le 2026-09-07 : *« le 22 rue Emile Chaillou a Trelaze a deux
 * parcelles, 525 et 526. Ma femme m'a dit que le cadastre le sait »*. La page
 * n'en servait qu'une - AD 525 - parce qu'elle demandait au cadastre quelle
 * parcelle CONTIENT le point representatif du batiment. Un point ne tombe que
 * dans une parcelle ; une maison, elle, s'etale.
 *
 * `?withPlots=1` rend `plots`, et chaque entree porte `bdg_cover_ratio` : la
 * part du BATIMENT posee sur cette parcelle. Au 22, AD 525 en porte 83,9 %,
 * AD 526 11,7 % et AD 984 4,5 %. Les deux premieres sont les parcelles de
 * l'adresse, la troisieme est un debord de trait - et c'est ce chiffre qui les
 * separe, pas une distance.
 *
 * SANS CE PARAMETRE, `plots` N'EXISTE PAS dans la reponse. Ce n'est pas un
 * champ vide, c'est un champ absent : un appel sans lui ne rend rien et ne
 * signale rien.
 */

import { json, JOUR } from './reseau.ts';

const RNB = 'https://rnb-api.beta.gouv.fr/api/alpha/buildings/';

/** Un batiment reellement construit ; le reste est projet ou demolition. */
const CONSTRUIT = 'constructed';

/**
 * LA FORME D'UNE CLE D'INTEROPERABILITE : INSEE, code de voie, numero.
 *
 * LA CORSE A DES LETTRES DANS SON CODE INSEE, et un motif en cinq chiffres
 * l'ecarte en silence. Mesure du 2026-09-10 : le 1 cours Napoleon a Ajaccio
 * porte la cle `2a004_0970_00001`, que le motif precedent refusait. Le refus
 * n'est pas une erreur, c'est un `null` - donc pas de batiment, donc pas de
 * parts, donc TOUTE la Corse retombait sur « la parcelle la plus proche », le
 * repli que la mesure du 2026-09-06 existe justement pour eviter.
 *
 * EXPORTEE POUR ETRE MESUREE : une expression reguliere qui perd un antislash
 * reste valide, passe le lint et le typage, et rend simplement `null` sur tout.
 * C'est deja arrive dans ce paquet, et seule une porte en 404 permanente l'a
 * fait voir.
 *
 * Le motif est celui de `cadastre.decouperIdentifiant`, qui lit deja un code
 * INSEE ainsi : un chiffre, puis un chiffre ou A ou B, puis trois chiffres.
 * Les departements d'outre-mer, eux, sont en chiffres et passaient deja.
 */
export const CLE_BAN = /^\d[\dAB]\d{3}_[0-9a-z]+_\d+/i;

/**
 * LA PART DU BATIMENT SOUS LAQUELLE UNE PARCELLE N'EST PLUS LA SIENNE.
 *
 * Releve du 2026-09-07 sur 72 adresses de six communes - Trelaze, Vitry,
 * Muret, Renaze, Morlaix, Bordeaux - soit 140 couples batiment-parcelle. La
 * distribution est franchement a deux bosses :
 *
 *     part du batiment | 0,0002 % ... 0,76 % | 5 % ... 100 %
 *     parcelles        |         57          |      72
 *
 * mediane 76 %, troisieme quartile 99,7 %, et seulement onze parcelles entre
 * 2 % et 30 %. Un debord de trait pese quelques millièmes ; une vraie parcelle
 * pese des dizaines de pour cent.
 *
 * CINQ POUR CENT, ET PAS DIX : le cas qui a ouvert le chantier tient a 11,7 %
 * (AD 526 au 22 rue Emile Chaillou), donc les deux seuils le gardent - mais un
 * seuil haut ecarte en SILENCE, alors qu'une parcelle de trop se voit : la page
 * ecrit la part a cote de chaque reference, et le lecteur juge. Une parcelle
 * absente, elle, ne se discute pas.
 */
export const PART_MINIMALE = 0.05;

/** Une parcelle sous le batiment, avec la part du batiment qu'elle porte. */
export interface ParcelleDuBatiment {
	/** L'identifiant cadastral a quatorze signes : `49353000AD0525`. */
	readonly idu: string;
	/** La part du batiment posee sur cette parcelle, de 0 a 1. */
	readonly part: number;
}

export interface BatimentDeLAdresse {
	readonly lon: number;
	readonly lat: number;
	/**
	 * Les parcelles que le batiment couvre vraiment, la plus couverte en tete.
	 * Vide quand le referentiel ne les publie pas - c'est un cas ordinaire, et
	 * l'appelant retombe alors sur la parcelle qui contient le point.
	 */
	readonly parcelles: readonly ParcelleDuBatiment[];
}

interface PlotBrut {
	id?: unknown;
	bdg_cover_ratio?: unknown;
}

interface ReponseRnb {
	results?: {
		status?: unknown;
		point?: { type?: unknown; coordinates?: unknown } | null;
		plots?: unknown;
	}[];
}

/**
 * Les parcelles retenues d'une reponse brute, la plus couverte en tete.
 *
 * Pure, donc mesurable : c'est ici que le seuil s'applique, et un seuil qu'on
 * ne peut pas exercer sur des valeurs choisies n'est pas un seuil, c'est un
 * souhait.
 */
export function parcellesRetenues(plots: unknown): ParcelleDuBatiment[] {
	if (!Array.isArray(plots)) return [];
	return (plots as PlotBrut[])
		.map((p) => ({
			idu: typeof p.id === 'string' ? p.id : '',
			part: typeof p.bdg_cover_ratio === 'number' ? p.bdg_cover_ratio : 0
		}))
		.filter((p) => p.idu !== '' && p.part >= PART_MINIMALE)
		.sort((a, b) => b.part - a.part);
}

/**
 * Le batiment porte par une adresse, ou `null`.
 *
 * Le referentiel rend un `point` representatif deja calcule : on ne recalcule
 * pas un centre a partir de la forme, ce qui serait une deuxieme facon de
 * repondre a la meme question. Une adresse sans batiment connu rend `null`, et
 * c'est un cas ORDINAIRE - un terrain nu, une adresse neuve, une commune que le
 * referentiel n'a pas encore couverte.
 */
export async function batimentDeLAdresse(cleBan: string): Promise<BatimentDeLAdresse | null> {
	if (!CLE_BAN.test(cleBan)) return null;
	const brut = (await json(
		`${RNB}?cle_interop_ban=${encodeURIComponent(cleBan)}&withPlots=1`,
		JOUR
	)) as ReponseRnb | null;
	for (const b of brut?.results ?? []) {
		if (b.status !== CONSTRUIT) continue;
		const c = b.point?.coordinates;
		if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
		return { lon: c[0], lat: c[1], parcelles: parcellesRetenues(b.plots) };
	}
	return null;
}
