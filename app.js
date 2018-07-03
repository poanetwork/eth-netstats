var _ = require('lodash');
var logger = require('./lib/utils/logger');
var chalk = require('chalk');
var http = require('http');
const WebSocket = require('ws');

// Init WS Backend variables
var BACKEND_SECRET;
var BACKEND_URL;

if( !_.isUndefined(process.env.BACKEND_SECRET) && !_.isNull(process.env.BACKEND_SECRET) &&
    !_.isUndefined(process.env.BACKEND_URL) && !_.isNull(process.env.BACKEND_URL))
{
	BACKEND_SECRET = process.env.BACKEND_SECRET;
	BACKEND_URL = process.env.BACKEND_URL;
}
else
{
	try {
		var tmp_backend_json = require('./backend_var.json');
		BACKEND_URL= tmp_backend_json.url;
		BACKEND_SECRET= tmp_backend_json.wssecret;
	}
	catch (e)
	{
		console.error("NEEDED VARIABLES FOR BACKEND CONNECTION NOT SET!!!");
	}
}

var banned = require('./lib/utils/config').banned;

// Init http server
if( process.env.NODE_ENV !== 'production' )
{
	var app = require('./lib/express');
	server = http.createServer(app);
}
else
	server = http.createServer();

// Init socket vars
var Primus = require('primus');
// var api;
var client;
var server;

var reconnectInterval = 10 * 1000; // reconnect after 10 seconds if fails
var connect = function() {
		ws = new WebSocket(BACKEND_URL, {
					headers : {
						wssecret: BACKEND_SECRET
					}
				});

		ws.on('error', function handling_error(error) {
			console.error('API', '[CONN]', error);
		})

		ws.on('open', function() {
		  console.success('API', '[CONN]', 'Connection with Backend established');
		});

		ws.on('message', function(message) {
			message_parsed = JSON.parse(message);
			dispatch_data(message_parsed, message);
		});

    ws.on('close', function() {
        console.warn('API', '[CONN]', 'Connection with Backend lost, reconnecting');
        setTimeout(connect, reconnectInterval);
    });
};

connect();

var dispatch_data = function(message_parsed, message) {
	data = message_parsed.data
	switch (data.type) {
		case 'information':
			handle_information(message_parsed);
			break;
		case 'block':
			handle_block(message_parsed);
			break;
		case 'history':
			handle_history(message_parsed, message);
			break;
		case 'statistics':
			handle_statistics(message_parsed);
			break;
		case 'latency':
			handle_latency(message_parsed);
			break;
		case 'pending':
			handle_pending(message_parsed);
			break;
		default:
			console.warn('WS', 'MSG', 'unnexpected message type', data.type);
	}
}

var handle_information = function(message_parsed) {
	information = {};
	information.info = message_parsed.data.body;
	information.id = message_parsed.agent_id;
	information.latency = 0;

	Nodes.add(information, function (err, info)
	{
		if(err !== null)
		{
			console.error('API', 'CON', 'Connection error:', err);
			return false;
		}

		if(info !== null)
		{
			console.success('API', 'CON', 'Connected', information.id);

			client.write({
				action: 'add',
				data: info
			});
		}
	});
}

var handle_block = function(message_parsed) {
	data = {};
	data.block = message_parsed.data.body;
	data.id = message_parsed.agent_id;

	if( !_.isUndefined(data.id) && !_.isUndefined(data.block) )
	{
		Nodes.addBlock(data.id, data.block, function (err, block)
		{
			if(err !== null)
			{
				console.error('API', 'BLK', 'Block error:', err);
			}
			else
			{
				if(block !== null)
				{
					client.write({
						action: 'block',
						data: block
					});

					console.success('API', 'BLK', 'Block:', block.block['number'], 'from:', block.id);

					Nodes.getCharts();
				}
			}
		});
	}
	else
	{
		console.error('API', 'BLK', 'Block error:', block);
	}
}

var handle_history = function(message_parsed, message) {
	data = {};
	data.history = message_parsed.data.body.history;
	data.id = message_parsed.agent_id;

	console.success('API', 'HIS', 'Got history from:', data.id);

	var time = chalk.reset.cyan((new Date()).toJSON()) + " ";
	console.time(time, 'COL', 'CHR', 'Got charts in');

	Nodes.addHistory(data.id, data.history, function (err, history)
	{
		console.timeEnd(time, 'COL', 'CHR', 'Got charts in');

		if(err !== null)
		{
			console.error('COL', 'CHR', 'History error:', err);
		}
		else
		{
			client.write({
				action: 'charts',
				data: history
			});
		}
	});
}

var handle_statistics = function(message_parsed) {
	data = {};
	data.stats = message_parsed.data.body;
	data.id = message_parsed.agent_id;

	if( !_.isUndefined(data.id) && !_.isUndefined(data.stats) )
	{

		Nodes.updateStats(data.id, data.stats, function (err, stats)
		{
			if(err !== null)
			{
				console.error('API', 'STA', 'Stats error:', err);
			}
			else
			{
				if(stats !== null)
				{
					client.write({
						action: 'stats',
						data: stats
					});

					console.success('API', 'STA', 'Stats from:', data.id);
				}
			}
		});
	}
	else
	{
		console.error('API', 'STA', 'Stats error:', data);
	}
}

var handle_latency = function(message_parsed) {
	data = {};
	data.latency = message_parsed.data.body.latency;
	data.id = message_parsed.agent_id;

	if( !_.isUndefined(data.id) )
	{
		Nodes.updateLatency(data.id, data.latency, function (err, latency)
		{
			if(err !== null)
			{
				console.error('API', 'PIN', 'Latency error:', err);
			}

			if(latency !== null)
			{
				client.write({
					action: 'latency',
					data: latency
				});

				console.info('API', 'PIN', 'Latency:', latency, 'from:', data.id);
			}
		});
	}
}

var handle_pending = function(message_parsed) {
	data = {};
	data.stats = message_parsed.data.body;
	data.id = message_parsed.agent_id;

	if( !_.isUndefined(data.id) && !_.isUndefined(data.stats) )
	{
		Nodes.updatePending(data.id, data.stats, function (err, stats) {
			if(err !== null)
			{
				console.error('API', 'TXS', 'Pending error:', err);
			}

			if(stats !== null)
			{
				client.write({
					action: 'pending',
					data: stats
				});

				console.success('API', 'TXS', 'Pending:', data.stats['pending'], 'from:', data.id);
			}
		});
	}
	else
	{
		console.error('API', 'TXS', 'Pending error:', data);
	}
}

// Init Client Socket connection
client = new Primus(server, {
	transformer: 'websockets',
	pathname: '/primus',
	parser: 'JSON'
});

client.plugin('emit', require('primus-emit'));


// Init external API
external = new Primus(server, {
	transformer: 'websockets',
	pathname: '/external',
	parser: 'JSON'
});

external.plugin('emit', require('primus-emit'));

// Init collections
var Collection = require('./lib/collection');
var Nodes = new Collection(external);

Nodes.setChartsCallback(function (err, charts)
{
	if(err !== null)
	{
		console.error('COL', 'CHR', 'Charts error:', err);
	}
	else
	{
		client.write({
			action: 'charts',
			data: charts
		});
	}
});

client.on('connection', function (clientSpark)
{
	clientSpark.on('ready', function (data)
	{
		clientSpark.emit('init', { nodes: Nodes.all() });

		Nodes.getCharts();
	});

	clientSpark.on('client-pong', function (data)
	{
		var serverTime = _.get(data, "serverTime", 0);
		var latency = Math.ceil( (_.now() - serverTime) / 2 );

		clientSpark.emit('client-latency', { latency: latency });
	});
});

var latencyTimeout = setInterval( function ()
{
	client.write({
		action: 'client-ping',
		data: {
			serverTime: _.now()
		}
	});
}, 5000);


// Cleanup old inactive nodes
var nodeCleanupTimeout = setInterval( function ()
{
	client.write({
		action: 'init',
		data: Nodes.all()
	});

	Nodes.getCharts();

}, 1000*60*60);

server.listen(process.env.PORT || 3000);

module.exports = server;
