/**
 * The Phaser build the game ships (vite.config.ts aliases `phaser` to this file for production builds only; dev, tests and
 * types use the stock package). It is Phaser's own src/phaser.js minus what the game never touches: physics (Arcade and
 * Matter), tilemaps, sound (all audio is our own Web Audio graph and the game runs with `audio.noAudio`), the DOM element,
 * video, particles, meshes / shaders / lights and the other unused game objects, and every loader file type except the
 * sprite sheet (and the image file it builds on). The engine core, renderers, scenes, input, cameras, textures, math, geometry,
 * tweens and timers are all still here, so the `Phaser.*` namespaces the game uses keep their full contents.
 *
 * Feature flags (`typeof WEBGL_RENDERER` ...) are set by the `phaserFlags` plugin in vite.config.ts, as Phaser's own
 * webpack build does.
 */

require('phaser/src/polyfills/requestVideoFrame');

var CONST = require('phaser/src/const');
var Extend = require('phaser/src/utils/object/Extend');


var GameObjects = {
    Events: require('phaser/src/gameobjects/events'),
    DisplayList: require('phaser/src/gameobjects/DisplayList'),
    GameObjectCreator: require('phaser/src/gameobjects/GameObjectCreator'),
    GameObjectFactory: require('phaser/src/gameobjects/GameObjectFactory'),
    UpdateList: require('phaser/src/gameobjects/UpdateList'),
    Components: require('phaser/src/gameobjects/components'),
    GetCalcMatrix: require('phaser/src/gameobjects/GetCalcMatrix'),
    BuildGameObject: require('phaser/src/gameobjects/BuildGameObject'),
    BuildGameObjectAnimation: require('phaser/src/gameobjects/BuildGameObjectAnimation'),
    GameObject: require('phaser/src/gameobjects/GameObject'),
    BitmapText: require('phaser/src/gameobjects/bitmaptext/static/BitmapText'),
    Graphics: require('phaser/src/gameobjects/graphics/Graphics'),
    Image: require('phaser/src/gameobjects/image/Image'),
    Layer: require('phaser/src/gameobjects/layer/Layer'),
    RetroFont: require('phaser/src/gameobjects/bitmaptext/RetroFont'),
    Sprite: require('phaser/src/gameobjects/sprite/Sprite'),
    Text: require('phaser/src/gameobjects/text/Text'),
    TileSprite: require('phaser/src/gameobjects/tilesprite/TileSprite'),
    Shape: require('phaser/src/gameobjects/shape/Shape'),
    Rectangle: require('phaser/src/gameobjects/shape/rectangle/Rectangle'),
    Factories: {
        Graphics: require('phaser/src/gameobjects/graphics/GraphicsFactory'),
        Image: require('phaser/src/gameobjects/image/ImageFactory'),
        Layer: require('phaser/src/gameobjects/layer/LayerFactory'),
        Sprite: require('phaser/src/gameobjects/sprite/SpriteFactory'),
        StaticBitmapText: require('phaser/src/gameobjects/bitmaptext/static/BitmapTextFactory'),
        Text: require('phaser/src/gameobjects/text/TextFactory'),
        TileSprite: require('phaser/src/gameobjects/tilesprite/TileSpriteFactory'),
        Rectangle: require('phaser/src/gameobjects/shape/rectangle/RectangleFactory')
    },
    Creators: {
        Graphics: require('phaser/src/gameobjects/graphics/GraphicsCreator'),
        Image: require('phaser/src/gameobjects/image/ImageCreator'),
        Layer: require('phaser/src/gameobjects/layer/LayerCreator'),
        Sprite: require('phaser/src/gameobjects/sprite/SpriteCreator'),
        StaticBitmapText: require('phaser/src/gameobjects/bitmaptext/static/BitmapTextCreator'),
        Text: require('phaser/src/gameobjects/text/TextCreator'),
        TileSprite: require('phaser/src/gameobjects/tilesprite/TileSpriteCreator')
    }
};

var Loader = {
    FileTypes: {
        ImageFile: require('phaser/src/loader/filetypes/ImageFile'),
        SpriteSheetFile: require('phaser/src/loader/filetypes/SpriteSheetFile')
    },
    File: require('phaser/src/loader/File'),
    FileTypesManager: require('phaser/src/loader/FileTypesManager'),
    GetURL: require('phaser/src/loader/GetURL'),
    LoaderPlugin: require('phaser/src/loader/LoaderPlugin'),
    MergeXHRSettings: require('phaser/src/loader/MergeXHRSettings'),
    MultiFile: require('phaser/src/loader/MultiFile'),
    XHRLoader: require('phaser/src/loader/XHRLoader'),
    XHRSettings: require('phaser/src/loader/XHRSettings')
};
Extend(false, Loader, require('phaser/src/loader/const'));
Loader.Events = require('phaser/src/loader/events');

var Phaser = {
    Actions: require('phaser/src/actions'),
    Animations: require('phaser/src/animations'),
    BlendModes: require('phaser/src/renderer/BlendModes'),
    Cache: require('phaser/src/cache'),
    Cameras: require('phaser/src/cameras'),
    Core: require('phaser/src/core'),
    Class: require('phaser/src/utils/Class'),
    Create: require('phaser/src/create'),
    Curves: require('phaser/src/curves'),
    Data: require('phaser/src/data'),
    Display: require('phaser/src/display'),
    DOM: require('phaser/src/dom'),
    Events: require('phaser/src/events'),
    FX: require('phaser/src/fx'),
    Game: require('phaser/src/core/Game'),
    GameObjects: GameObjects,
    Geom: require('phaser/src/geom'),
    Input: require('phaser/src/input'),
    Loader: Loader,
    Math: require('phaser/src/math'),
    Plugins: require('phaser/src/plugins'),
    Renderer: require('phaser/src/renderer'),
    Scale: require('phaser/src/scale'),
    ScaleModes: require('phaser/src/renderer/ScaleModes'),
    Scene: require('phaser/src/scene/Scene'),
    Scenes: require('phaser/src/scene'),
    Structs: require('phaser/src/structs'),
    Textures: require('phaser/src/textures'),
    Time: require('phaser/src/time'),
    Tweens: require('phaser/src/tweens'),
    Utils: require('phaser/src/utils')
};

Phaser = Extend(false, Phaser, CONST);

module.exports = Phaser;

globalThis.Phaser = Phaser;
