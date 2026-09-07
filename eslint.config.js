import path from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

/*
 * LA MEME CONFIGURATION QUE CELLE DES SITES QUI CONSOMMENT CE PAQUET, moins ce
 * qui touche a Astro. C'est deliberé : le code de ce paquet vient de la, il y
 * retournera par des imports, et deux jeux de regles differents feraient rougir
 * a l'extraction du code qui passait la veille.
 *
 * PAS DE `projectService` : les regles qui demandent le type ne sont pas
 * activees chez les consommateurs non plus. En les allumant ici, l'extraction
 * aurait ouvert des erreurs sur des lignes inchangees, ce qui aurait melange
 * deux chantiers - deplacer du code, et le corriger.
 */
export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	sonarjs.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint recommends not to use no-undef on TS projects.
			'no-undef': 'off',
			// Allow _-prefixed params/vars as intentional "unused" markers.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},
	{
		rules: {
			'sonarjs/cognitive-complexity': ['error', 25],
			'sonarjs/no-nested-conditional': 'off',
			'sonarjs/no-unused-vars': 'off'
		}
	},
	// Formatting belongs to prettier; drop every stylistic rule so the two
	// tools never fight. Must stay last.
	prettier
);
