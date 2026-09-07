/*
 * Le trace du plan cadastral, calcule sur le serveur.
 *
 * Pas de bibliotheque de carte et pas de tuile distante : la politique de
 * contenu du site n'autorise aucune image externe, et une carte glissante est
 * une application, pas une page qui se refere. Ce qu'il faut ici est un dessin
 * fixe qui montre OU est la parcelle dans son tissu, et qui reste lisible
 * imprime.
 *
 * La longitude est multipliee par le cosinus de la latitude avant projection.
 * Sans cela, un degre de longitude est traite comme un degre de latitude alors
 * qu'il vaut 73 km contre 111 km a Paris : le plan sort etire de moitie, et les
 * parcelles ne ressemblent plus a celles du plan officiel.
 */

import type { Parcelle } from './cadastre.ts';
import type { Batiment } from './bati.ts';

export interface Trace {
	readonly d: string;
	readonly idu: string;
	readonly cible: boolean;
}

/** Le rectangle geographique qu'un dessin couvre, en degres. */
export interface Cadre {
	readonly ouest: number;
	readonly sud: number;
	readonly est: number;
	readonly nord: number;
}

export interface Dessin {
	readonly largeur: number;
	readonly hauteur: number;
	readonly traces: readonly Trace[];
	/** Le bati, dessine SOUS les limites : c'est un reperage, pas une limite. */
	readonly bati: readonly string[];
	/** Metres representes par la largeur du dessin, pour l'echelle graphique. */
	readonly largeurMetres: number;
	/*
	 * L'ETENDUE GEOGRAPHIQUE EXACTE DU DESSIN, et elle sert a une chose : caler
	 * une image dessous. Un fond demande sur ce cadre, a `largeur` x `hauteur`
	 * pixels et en `CRS:84`, tombe au pixel sur les traits - le serveur etale la
	 * longitude sur la largeur comme on le fait ici, et le rapport des cotes est
	 * deja corrige par le cosinus de la latitude.
	 */
	readonly cadre: Cadre;
}

const METRES_PAR_DEGRE_LAT = 111_320;
const COTE_MAX = 640;

/**
 * Le dessin des parcelles, la cible en premier plan.
 *
 * Rend `null` plutot qu'un dessin vide : une figure sans trait est un cadre
 * blanc que le lecteur prend pour une panne d'affichage.
 */
export function dessiner(
	parcelles: readonly Parcelle[],
	iduCible: string,
	batiments: readonly Batiment[] = [],
	/*
	 * LE CADRE IMPOSE, QUAND C'EST LE LECTEUR QUI CHOISIT CE QU'IL REGARDE.
	 *
	 * Sans lui, le dessin se cale sur les parcelles RECUES : agrandir n'agrandit
	 * rien, puisque moins de parcelles reviennent et que leur boite se resserre
	 * d'autant. Le zoom et le deplacement de la page de plan donnent donc leur
	 * cadre, et les parcelles qui debordent sont coupees par le `viewBox` -
	 * exactement comme le bati l'est deja.
	 */
	cadreImpose?: Cadre
): Dessin | null {
	if (parcelles.length === 0) return null;
	const latitudes = parcelles.flatMap((p) => p.contour.flatMap((a) => a.map(([, lat]) => lat)));
	if (latitudes.length === 0) return null;
	const latMoyenne = latitudes.reduce((s, v) => s + v, 0) / latitudes.length;
	const kx = Math.cos((latMoyenne * Math.PI) / 180);

	const xs = parcelles.flatMap((p) => p.contour.flatMap((a) => a.map(([lon]) => lon * kx)));
	const [minX, maxX] =
		cadreImpose === undefined
			? [Math.min(...xs), Math.max(...xs)]
			: [cadreImpose.ouest * kx, cadreImpose.est * kx];
	const [minY, maxY] =
		cadreImpose === undefined
			? [Math.min(...latitudes), Math.max(...latitudes)]
			: [cadreImpose.sud, cadreImpose.nord];
	const [etendueX, etendueY] = [maxX - minX, maxY - minY];
	if (etendueX <= 0 || etendueY <= 0) return null;

	const echelle = COTE_MAX / Math.max(etendueX, etendueY);
	const px = (lon: number) => (lon * kx - minX) * echelle;
	const py = (lat: number) => (maxY - lat) * echelle;
	const arrondi = (v: number) => Math.round(v * 10) / 10;

	const sommet = ([lon, lat]: readonly [number, number]) =>
		`${String(arrondi(px(lon)))},${String(arrondi(py(lat)))}`;
	const chemin = (anneau: readonly (readonly [number, number])[]) =>
		`M${anneau.map(sommet).join('L')}Z`;

	const traces = parcelles.map((p) => ({
		idu: p.idu,
		cible: p.idu === iduCible,
		d: p.contour.map(chemin).join('')
	}));

	/*
	 * Le bati est CADRE sur les parcelles, pas l'inverse : un batiment qui
	 * deborde du plan est coupe par le `viewBox`, la ou l'inclure dans le calcul
	 * ferait retrecir les parcelles pour rien.
	 */
	const bati = batiments.map((b) => b.contour.map(chemin).join('')).filter((d) => d !== '');

	return {
		largeur: Math.round(etendueX * echelle),
		hauteur: Math.round(etendueY * echelle),
		bati,
		// La largeur en metres passe par la latitude, seule direction ou un degre
		// a une longueur constante : le facteur de longitude est deja applique.
		largeurMetres: Math.round(etendueX * METRES_PAR_DEGRE_LAT),
		// Les x sont ranges en degres CORRIGES : on les rend a la longitude.
		cadre: { ouest: minX / kx, sud: minY, est: maxX / kx, nord: maxY },
		traces: [...traces.filter((t) => !t.cible), ...traces.filter((t) => t.cible)]
	};
}

/** Une longueur ronde qui tient dans le tiers du dessin, pour l'echelle graphique. */
export function pasEchelle(largeurMetres: number): number {
	const cible = largeurMetres / 3;
	const paliers = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
	return paliers.findLast((p) => p <= cible) ?? paliers[0]!;
}
