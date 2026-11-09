// Metro: nạp module khi cần (inlineRequires) để app mở nhanh hơn trên máy yếu.
const {getDefaultConfig} = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.transformer.getTransformOptions = async () => ({transform: {experimentalImportSupport: false, inlineRequires: true}});
module.exports = config;
