'use strict';
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , app = express()
  , server = http.createServer(app)
  , WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({server: server})
  ;

wss.on('connection', function (socket) {
    var arDrone       = require('/Users/jschulz/Sites/node-ar-drone/'),
        tcpVideoStream = new arDrone.Client.PngStream.TcpVideoStream({timeout: 4000}),
        Parser = require('./lib/PaVEParser'),
        p = new Parser();

    // TODO: handle client disconnect
    p.on('data', function (data) {
        socket.send(data, {binary: true});
    });

    tcpVideoStream.connect(function () {
        tcpVideoStream.pipe(p);
    });
});


app.configure(function () {
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade', { pretty: true });
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function () {
    app.use(express.errorHandler());
    app.locals.pretty = true;
});

app.get('/', routes.index);

var visionApp        = express();
var visionHTTPServer = http.createServer(visionApp);
var constants        = require('/Users/jschulz/Sites/node-ar-drone/lib/constants');
var navMasks         = require('/Users/jschulz/Sites/node-ar-drone/lib/navdata/masks');
var navKeys          = constants.NAVDATA_KEYS;
var TAG_TYPE_MASK    = navMasks.TAG_TYPE_MASK;

visionHTTPServer.listen(8080);

var visionSocketServer = new WebSocketServer({server: visionHTTPServer});
visionSocketServer.on('connection', function(vs) {
  var arDrone = require('/Users/jschulz/Sites/node-ar-drone/');
  var client = arDrone.createClient();
  // increase the frequency of the navadata updates
  client.config('general:navdata_demo', 'FALSE');

  // control the keys in the navdata
  var optionsMask = navMasks.combine(navKeys.DEMO, navKeys.VISION_DETECT);
  client.config('general:navdata_options', optionsMask);

  // enable vision
  client.config('detect:detect_type', constants.CAD_TYPE.VISION);
  // OR detect multiple tag types
  // client.config('detect:detect_type', constants.CAD_TYPE.MULTIPLE_DETECTION_MODE);

  // look for oriented roundel underneath
  // var vMask = TAG_TYPE_MASK(constants.CAD_TYPE.H_ORIENTED_ROUNDEL);
  // client.config('detect:detections_select_v', vMask);

  // look for a shell tag in front
  var hMask = TAG_TYPE_MASK(constants.TAG_TYPE.SHELL_TAG);
  client.config('detect:detections_select_h', hMask);

  // log navdata
  client.on('navdata', function onNavdata(navdata) {
    var vision   = navdata.visionDetect;
    var detected = vision && vision.nbDetected;
    var tags     = [];

    if (detected) {
      // drone sends values for a 1000x1000 canvas
      // ffmpeg is currently sending 640x360 stream
      var scale = {width: 640/1000, height: 360/1000};

      // I don't like the existing data structure:
      // {
      //   x: [200, 345, 0, 0], // [tag1, tag2, tag3, tag4]
      //   y: [400, 456, 0, 0]  // [tag1, tag2, tag3, tag4]
      //   type: [1, 1, 0, 0]   // [tag1, tag2, tag3, tag4]
      //   ...
      // }
      // Change it to:
      // [
      //   {x: 200, y: 400, type: 1}, // tag1
      //   {x: 345, y: 456, type: 0}, // tag2
      //   // no tag3 or tag4
      // ]
      for (var i=0; i < detected; i++){
        var raw = {
          x: vision.xc[i],
          y: vision.yc[i],
          type: vision.type[i],
          width: vision.width[i],
          height: vision.height[i],
          distance: vision.dist[i]
        };
        var scaled = {
          x: Math.round(raw.x * scale.width),
          y: Math.round(raw.y * scale.height),
          width: Math.round(raw.width * scale.width),
          height: Math.round(raw.height * scale.height)
        };
        tags[i] = {raw: raw, scaled: scaled};
        // console.log('\tw: %s\th: %s\tleft: %s\ttop: %s',  raw.width, raw.height, raw.x, raw.y, raw.distance);
        // console.log('\tw: %s\th: %s\tleft: %s\ttop: %s scaled[w:%s, h:%s]',  scaled.width, scaled.height, scaled.x, scaled.y, scale.width, scale.height);
      }
      console.log(tags.length, tags);
      vs.send(JSON.stringify({tags: tags}), function(){});
    }
    else {
      vs.send(JSON.stringify({tags: []}), function(){});
    }
  });
});

if (module.parent) {
    module.exports = server;
} else {
    server.listen(app.get('port'), function () {
        console.log("Express server listening on port " + app.get('port'));
    });
}
