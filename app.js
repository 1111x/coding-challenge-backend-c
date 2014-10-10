var http = require('http');
var url = require('url');
var geolib = require('geolib'); 
var fs = require('fs');
var path = require('path');
var MongoClient = require('mongodb').MongoClient;

var dotenv = require('dotenv');
dotenv.load();

var PORT = process.env.PORT || 2345;
var HOST = process.env.HOST || '0.0.0.0';
var NODE_ENV = process.env.NODE_ENV || "development";
var DEBUG_MODE = process.env.DEBUG_MODE || false;

var myLat = 45.468462;
var myLong = -73.620843;

var server = http.createServer(function(req, resp) {
	var arrResults = [];
	if (req.url.indexOf('/suggestions') === 0) {
		// decode querystring
		// log(req.url);
		var parts = url.parse(req.url, true);
		// ensure we have search text in the q argument
		if (parts.query['q'] == undefined || parts.query['q'].trim() == "") {
			// log('invalid q passed in');
			resp.writeHead(404, {'Content-Type':'application/json'});
			resp.end(JSON.stringify({"suggestions":arrResults}) + '\n');
		} else {
			var q = parts.query['q'];
			// check if we have any results
			MongoClient.connect(process.env.MONGOLAB_URI, function(err, db) {
				if(err) { 
					console.error('connection error: ' + err);
					process.exit(1);
				}
			    var collection = db.collection('cities');
			    var popLimit = 5000;
			    var regex = new RegExp('^'+q, 'i')
			    collection.find({
			    	$or: [ { ascii:regex }, { name:regex } ] ,population:{$gt: popLimit}
			    }
			    // ,{ name:1, alt_name:1, country:1, admin1:1, lat:1, long:1, population:1, _id:0 }	
			    ).sort({name:1}).toArray(function(err, results) {
			    	if (err != null) {
			    		console.error('find error: ' + err);
			    		process.exit(2);
			    	} else {
			            if (results == undefined || results.length == 0) {
			                // log("0 results returned for '" + q + "'");
					resp.writeHead(404, {'Content-Type':'application/json'});
			            	resp.end(JSON.stringify({"suggestions":arrResults}) + '\n');
			            } else {
			                // log(results.length + " results returned for '" + q + "'");
			                results.forEach(function(entry) {
			                	var fullcity = getFullCity(entry);
						var distance = getDistance(parts, entry['lat'], entry['long']);
			                	var score = getScore(distance);
						var distance = getDistance(parts, entry['lat'], entry['long']);
			                	arrItem={"name":fullcity,
			                			// "realname":entry['name'],
			                			//"ascii":entry['ascii'],
			                			//"alt_name":entry['alt_name'],
			                			"latitude":entry['lat'],
			                			"longitude":entry['long'],
								"distance":distance,
								//"population":entry['population'],
								//"feat_class":entry['feat_class'],
								//"feat_code":entry['feat_code'],
			                			"score":score
			                		};
			                	arrResults.push(arrItem);
			                });
			                // TODO: sort results by score
			                var sortedResults = arrResults.sort(compare);
			                // present sorted results
							resp.writeHead(200, {'Content-Type':'application/json'});
							resp.end(JSON.stringify({"suggestions":sortedResults}) + '\n');
			                db.close(); // will exit the process
			            }
			    	}
			    });
			});
		}
	} else {
		var uri = url.parse(req.url).pathname;
		var filename = path.join(__dirname, uri);
		fs.exists(filename, function (exists) {
		  if (exists) {
			var contentTypes = {
			    '.html': 'text/html',
			    '.css': "text/css",
			    '.js': 'application/javascript'
			};
			var contentType = contentTypes[path.extname(filename)];
			resp.writeHead(200, {'Content-Type':contentType});
			resp.end(fs.readFileSync(filename));
		  } else {
			log("Could not find requested file " + uri);
			resp.writeHead(404, {'Content-Type':'plain'});
			resp.end();
		  }
		});
	}
	}).listen(PORT, HOST);
	// handle errors with server
	server.on('error', function (e) {
	  if (e.code == 'EADDRINUSE') {
	    log('Port ' + PORT + ' already in use. Retrying in 5 seconds...');
	    //setTimeout(function () {
	    //  server.close();
	     // server.listen(PORT, HOST);
	    //}, 5000);
	  } else {
		console.logerror(e.code);
	  }
	}
);

module.exports = server;

function isNumeric(obj) {
    obj = typeof(obj) === "string" ? obj.replace(",", ".") : obj;
    return !isNaN(parseFloat(obj)) && isFinite(obj) && Object.prototype.toString.call(obj).toLowerCase() !== "[object array]";
};

function log(str) {
	if (DEBUG_MODE) console.log(str);
}

function compare(a,b) {
	if (a.score < b.score)
		return 1;
	if (a.score > b.score)
		return -1;
	if (a.score = b.score) {
		if (a.distance > b.distance)
			return 1;
		if (a.distance < b.distance)
			return -1;
	}
	return 0;
}

var provinces = {
	1:'AB',
	2:'BC',
	3:'MB',
	4:'NB',
	5:'NL',
	6:'',
	7:'NS',
	8:'ON',
	9:'PE',
	10:'QC',
	11:'SK',
	12:'YT',
	13:'NT',
	14:'NU'
}

var testCities = {
	'montreal': {'latitude':'45.50884', 'longitude':'-73.58781'},
	'new york': {'latitude':'40.71427', 'longitude':'-74.00597'},
	'los angeles': {'latitude':'34.05223', 'longitude':'-118.24368'},
	'vancouver': {'latitude':'49.24966', 'longitude':'-123.11934'},
	'miami': {'latitude':'25.77427', 'longitude':'-80.19366'}
}

function getFullCity(entry) {
	if (entry['country'] == 'US') {
		return entry['ascii'] + ", " + entry['admin1'] + ", USA";
	} else {
		return entry['name'] + ", " + provinces[entry['admin1']] + ", Canada";
	}
}

function getDistance(parts, lat2, long2) {
	// convenience arguments for testing
	var city = parts.query['city'];
	if (city != undefined && city.trim() != '' && testCities[city.toLowerCase()]) {
		myLat = testCities[city.toLowerCase()]['latitude'];
		myLong = testCities[city.toLowerCase()]['longitude'];
	} else {
		myLat = parts.query['latitude'];
		myLong = parts.query['longitude'];
	}
	// only compute distance if we were passed in valid numeric arguments
	if (myLat == undefined || myLat.trim() == '' || 
		myLong == undefined || myLong.trim() == '' ||
		isNumeric(myLat) == false || isNumeric(myLong) == false) {
		return NaN;
	} else {
		var distance = geolib.getDistance(
		    {latitude: myLat, longitude: myLong}, 
		    {latitude: lat2, longitude: long2}
		)/1000; // divide by 1000 to convert meters to kilometers
		return Math.floor(distance);
	}
}

function getScore(distance) {
	var score = 0;
	var maxCircumference = 20039; // max kilometers along equator
	score = distance/maxCircumference;
	// closer results will have lowest difference, i.e. closer to 0, but the score = a confidence
	// level where 1 not 0 is high, so we need to reverse the figure by subtracting it from 1
	return (1-score);
}

log('Server running at http://127.0.0.1:' + PORT);
