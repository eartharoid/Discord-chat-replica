module.exports = {
	'env': {
		'commonjs': true,
		'es6': true,
		'browser': true,
		'node': true
	},
	'extends': 'eslint:recommended',
	'globals': {
		'Atomics': 'readonly',
		'SharedArrayBuffer': 'readonly'
	},
	'parserOptions': {
		'ecmaVersion': 2018
	},
	'rules': {
		'indent': [
			'warn',
			'tab'
		],
		'linebreak-style': [
			'off',
			'windows'
		],
		'quotes': [
			'warn',
			'single'
		],
		'semi': [
			'error',
			'always'
		],
		'no-control-regex': [
			'off'
		],
		'array-bracket-newline': [
			'error',
			'consistent'
		  ],
		  'array-bracket-spacing': [
			'error',
			'always'
		  ],
	}
};