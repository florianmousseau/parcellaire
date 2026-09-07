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
 * Le dessin des parcelles, les cibles en premier plan.
 *
 * Rend `null` plutot qu'un dessin vide : une figure sans trait est un cadre
 * blanc que le lecteur prend pour une panne d'affichage.
 *
 * PLUSIEURS CIBLES, PARCE QU'UNE ADRESSE EN COUVRE SOUVENT DEUX (2026-09-07) :
 * le 22 rue Emile Chaillou a Trelaze est sur AD 525 et AD 526. Surligner la
 * seule parcelle principale montrait la moitie du terrain sans le dire.
 */
export function dessiner(
	parcelles: readonly Parcelle[],
	cibles: string | readonly string[],
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
	/* Une chaine vide ne vise rien : c'est ce que passe la page d'une voie. */
	const visees = new Set(
		(typeof cibles === 'string' ? [cibles] : cibles).filter((idu) => idu !== '')
	);
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
		cible: visees.has(p.idu),
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

/*
 * ============================================================================
 * CADRER SUR L'OBJET, PAS SUR UNE FENETRE GEOGRAPHIQUE
 * ============================================================================
 *
 * Un cadre pris a une demi-largeur ronde - 25 m, 50 m - montre la parcelle a
 * la taille que le hasard lui donne : une parcelle de 24 m dans un cadre de
 * 50 en occupe la moitie, et ses cotes s'ecrivent dans ce qui reste. C'est ce
 * qui rendait le plan cote d'aucadastre moins clair que celui d'edifiable,
 * qui, lui, coupe sur la parcelle et lui laisse une marge CONSTANTE.
 *
 * Cette fonction rend le cadre qui pose l'objet au milieu d'une marge fixe en
 * PIXELS, quelle que soit sa taille au sol et quelle que soit sa forme. La
 * marge en degres se deduit de l'echelle, et l'echelle de la marge : en notant
 * L le plus grand cote de l'objet et M la marge voulue,
 *
 *     m x COTE_MAX / (L + 2m) = M   donc   m = M x L / (COTE_MAX - 2M)
 *
 * ce qui fait tomber `dessiner` sur exactement M pixels de chaque bord.
 */
export function cadreSurLObjet(
	boite: Cadre,
	/** La latitude ou l'on travaille : un degre de longitude n'y vaut pas 111 km. */
	latitude: number,
	margePixels: number
): Cadre {
	const kx = Math.cos((latitude * Math.PI) / 180);
	const largeCorrigee = (boite.est - boite.ouest) * kx;
	const haut = boite.nord - boite.sud;
	const grandCote = Math.max(largeCorrigee, haut);
	/* Une marge qui mange la moitie du dessin ne laisse plus rien a dessiner. */
	const marge = Math.min(margePixels, COTE_MAX / 2 - 1);
	if (grandCote <= 0 || marge <= 0 || kx === 0) return boite;
	const m = (marge * grandCote) / (COTE_MAX - 2 * marge);
	return {
		ouest: boite.ouest - m / kx,
		est: boite.est + m / kx,
		sud: boite.sud - m,
		nord: boite.nord + m
	};
}

/**
 * LA MARGE AUTOUR DES PARCELLES D'UNE ADRESSE, en pixels du dessin.
 *
 * Florian, le 2026-09-07 : *« la carte doit etre mieux zoomee sur la et les
 * parcelles et mieux centree ; on ne voit pas de quelle parcelle on parle,
 * c'est trop petit »*. Il avait raison, et le defaut n'etait pas le zoom mais
 * la FACON de cadrer : la page ouvrait une fenetre de taille fixe - 165 m -
 * centree sur le point de l'ADRESSE, qui est pose au bord de la chaussee. La
 * parcelle y tombait donc decentree, a la taille que son hasard lui donnait.
 *
 * Releve du 2026-09-07 sur six adresses de six communes, part du grand cote du
 * dessin occupee par la ou les parcelles :
 *
 *     Bordeaux 7 %   Muret 17 %   Trelaze 19 %   Morlaix 20 %
 *     Vitry 30 %     Renaze 46 %
 *
 * Cadre sur l'objet, cette part ne depend plus du hasard : 120 px de marge sur
 * les 640 du dessin laissent la parcelle occuper **63 %** du grand cote, et
 * une quinzaine de metres de tissu autour - assez pour voir la rue et les
 * voisines, ce qui est ce qui permet de se reconnaitre. Plus serre, la page ne
 * situerait plus rien ; plus large, on revient au timbre-poste.
 */
export const MARGE_DE_L_ADRESSE = 120;

/**
 * Le rectangle qui contient toutes ces parcelles, ou `null` si aucune n'a de
 * contour. C'est ce qu'on donne a `cadreSurLObjet` pour cadrer une adresse.
 */
export function boiteDesParcelles(parcelles: readonly Parcelle[]): Cadre | null {
	let ouest = Infinity;
	let est = -Infinity;
	let sud = Infinity;
	let nord = -Infinity;
	for (const p of parcelles) {
		for (const anneau of p.contour) {
			for (const [lon, lat] of anneau) {
				ouest = Math.min(ouest, lon);
				est = Math.max(est, lon);
				sud = Math.min(sud, lat);
				nord = Math.max(nord, lat);
			}
		}
	}
	return Number.isFinite(ouest) && Number.isFinite(sud) ? { ouest, sud, est, nord } : null;
}

/** Vrai quand le premier rectangle tient tout entier dans le second. */
export const tientDans = (petit: Cadre, grand: Cadre): boolean =>
	petit.ouest >= grand.ouest &&
	petit.est <= grand.est &&
	petit.sud >= grand.sud &&
	petit.nord <= grand.nord;

/** Une longueur ronde qui tient dans le tiers du dessin, pour l'echelle graphique. */
export function pasEchelle(largeurMetres: number): number {
	const cible = largeurMetres / 3;
	const paliers = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
	return paliers.findLast((p) => p <= cible) ?? paliers[0]!;
}
