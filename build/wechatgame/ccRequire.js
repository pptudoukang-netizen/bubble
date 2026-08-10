let moduleMap = {
'src/assets/scripts/bootstrap/DynamicAtlasBootstrap.js' () { return require('src/assets/scripts/bootstrap/DynamicAtlasBootstrap.js') },
'assets/internal/index.js' () { return require('assets/internal/index.js') },
'assets/main/index.js' () { return require('assets/main/index.js') },
// tail
};

window.__cocos_require__ = function (moduleName) {
    let func = moduleMap[moduleName];
    if (!func) {
        throw new Error(`cannot find module ${moduleName}`);
    }
    return func();
};