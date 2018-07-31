var http = require('http');
var tropo_webapi = require('./tropo-webapi');

var server = http.createServer(function (request, response) {
	
	var tropo = new TropoWebAPI();

	tropo.say("https://www.tropo.com/docs/troporocks.mp3");
	
	response.end(TropoJSON(tropo));

}).listen(8000);
