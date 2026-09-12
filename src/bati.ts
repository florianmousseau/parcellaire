/*
 * Le bati de la BD TOPO de l'IGN, servi par le WFS de la Geoplateforme.
 *
 * Deux choses en meme temps, et c'est pourquoi ce module existe plutot qu'un
 * simple decor :
 *
 *   - un plan cadastral SANS bati est une mosaique de polygones que personne ne
 *     reconnait. Avec, il devient la vue aerienne qu'on a en tete ;
 *   - la BD TOPO porte la HAUTEUR et le NOMBRE D'ETAGES de chaque batiment.
 *     Sur une page qui parle de regles d'urbanisme, savoir que le batiment
 *     existant fait 13,3 m sur quatre etages vaut mieux qu'un plafond
 *     reglementaire lu seul.
 *
 * LE PIEGE DU WFS : sa `BBOX` est en `lat,lon` et non `lon,lat`, parce que le
 * standard suit l'ordre des axes declare par EPSG:4326. Inversee, elle rend une
 * boite au large de la Somalie et zero batiment - sans erreur.
 */

import { json, SEMAINE } from './reseau.ts';
import { anneauxDe, centreDe, type Contour } from './geometrie.ts';

const WFS = 'https://data.geopf.fr/wfs/ows';

export interface Batiment {
	readonly contour: Contour;
	readonly hauteur: number | null;
	readonly etages: number | null;
	readonly usage: string;
	readonly nature: string;
	readonly centre: { readonly lon: number; readonly lat: number };
	/**
	 * Les logements du batiment, que la BD TOPO reprend des fichiers fonciers :
	 * 1 pour une maison, davantage pour un immeuble, 0 pour une annexe. `null`
	 * quand elle ne le dit pas, ce qui arrive sur un usage « Indifférencié ».
	 */
	readonly logements?: number | null;
	/** L'annee de construction (`date_d_apparition`), `null` quand elle manque. */
	readonly annee?: number | null;
}

/** Un objet du WFS tel qu'il arrive, avant lecture. */
export interface Trait {
	properties?: Record<string, unknown> | null;
	geometry?: { type?: unknown; coordinates?: unknown } | null;
}

const texte = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '');

const nombre = (valeur: unknown): number | null =>
	typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

/* « 1895-01-01Z » : l'annee seule a un sens, le jour est une convention du
   fichier foncier qui la porte. */
const anneeDe = (valeur: unknown): number | null => {
	const annee = /^(\d{4})-/.exec(texte(valeur))?.[1];
	return annee === undefined ? null : Number(annee);
};

/** Un batiment lu dans un objet du WFS, ou `null` sans contour. */
export function batimentDuTrait(t: Trait): Batiment | null {
	const contour = anneauxDe(t.geometry);
	if (contour.length === 0) return null;
	return {
		contour,
		hauteur: nombre(t.properties?.hauteur),
		etages: nombre(t.properties?.nombre_d_etages),
		usage: texte(t.properties?.usage_1),
		nature: texte(t.properties?.nature),
		centre: centreDe(contour) ?? { lon: 0, lat: 0 },
		logements: nombre(t.properties?.nombre_de_logements),
		annee: anneeDe(t.properties?.date_d_apparition)
	};
}

/** Le bati d'un rectangle autour d'un point. Le rayon est celui du plan. */
export async function batiAutour(
	lon: number,
	lat: number,
	rayonDegres = 0.0011
): Promise<Batiment[]> {
	const boite = [
		lat - rayonDegres * 0.66,
		lon - rayonDegres,
		lat + rayonDegres * 0.66,
		lon + rayonDegres
	].join(',');
	const url =
		`${WFS}?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&TYPENAMES=BDTOPO_V3:batiment` +
		`&BBOX=${boite}&COUNT=300&OUTPUTFORMAT=application/json`;
	const brut = (await json(url, SEMAINE)) as { features?: unknown } | null;
	if (!Array.isArray(brut?.features)) return [];
	return (brut.features as Trait[]).map(batimentDuTrait).filter((b): b is Batiment => b !== null);
}

/**
 * Le batiment le plus proche d'un point, s'il est assez pres pour etre le sien.
 *
 * Vingt-cinq metres : au-dela, le point d'une adresse designe un terrain nu, une
 * cour ou la voie elle-meme, et nommer alors le batiment d'en face serait pire
 * que de ne rien dire.
 */
export function batimentDuPoint(
	batiments: readonly Batiment[],
	lon: number,
	lat: number
): Batiment | null {
	const METRES_PAR_DEGRE = 111_320;
	const kx = Math.cos((lat * Math.PI) / 180);
	let plusProche: Batiment | null = null;
	let plusCourt = Infinity;
	for (const b of batiments) {
		const dx = (b.centre.lon - lon) * kx;
		const dy = b.centre.lat - lat;
		const metres = Math.hypot(dx, dy) * METRES_PAR_DEGRE;
		if (metres < plusCourt) {
			plusCourt = metres;
			plusProche = b;
		}
	}
	return plusCourt <= 25 ? plusProche : null;
}
