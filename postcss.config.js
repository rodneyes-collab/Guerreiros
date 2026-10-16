export default {
  plugins: {
    '@tailwindcss/postcss': {},
    '@csstools/postcss-cascade-layers': {},
    'postcss-preset-env': {
      stage: 3,
      features: {
        'custom-properties': true,
        'nesting-rules': true,
      },
      autoprefixer: { grid: 'autoplace' },
    },
  },
}
