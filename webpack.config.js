module.exports = {
  entry: './src/app.js',
  output: {
    path: __dirname + '/dist',
    publicPath: '/',
    filename: 'bundle.js'
  },
  devServer: {
    contentBase: './dist'
  },
module: {
  rules: [{
    test: /\.(js)$/,
    exclude: /node_modules/,
    use: ['babel-loader']
  }, {
    test: /\.s[ac]ss$/i,
    use: [
      { loader: 'style-loader' },
      { loader: 'css-loader',
        options: { modules: true }
      },
      { loader: 'sass-loader' }
    ]
  }, {
      test: /\.(png|svg|jpg|gif)$/,
      use: ['file-loader'],
    }, {
      test: /\.(gltf)$/,
      use: [{loader: "gltf-webpack-loader"}]
    }
    ]},
  resolve: {
    extensions: ['*', '.js']
  },
  devtool: 'source-map'
};

