import colors from 'tailwindcss/colors.js';

export default {
	content: [
		'./src/renderer/**/*.{js,jsx,ts,tsx,ejs}',
		'./src/components/**/*.{js,jsx,ts,tsx,ejs}',
	],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				sky: colors.sky,
				cyan: colors.cyan,
			},
		},
	},
	plugins: [],
};
