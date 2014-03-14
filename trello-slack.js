#!/usr/bin/env node

var fs = require('fs')
   ,Trello = require('node-trello')
   ,Slack = require('node-slack');

var cfg = require('./config.json');
var trello = new Trello(cfg.trello.auth.key, cfg.trello.auth.token);
var slack = new Slack(cfg.slack.domain, cfg.slack.token);
var redis, prevId, handlers, cachedCardLists = {};
var mechanism = 'file';

bootstrap(function(prev){
	prevId = prev;
	watch();
});

function bootstrap(callback){
	//if we can find a file named "last.id" then use that to store the activity timeline bookmark
	if (fs.existsSync('./last.id')){
		callback( fs.readFileSync('./last.id').toString() );
	}else{
		//redis!
		mechanism = 'redis';
		if (process.env.REDISTOGO_URL) {
			var rtg   = require("url").parse(process.env.REDISTOGO_URL);
			redis = require("redis").createClient(rtg.port, rtg.hostname);
			redis.auth(rtg.auth.split(":")[1]);
		} else {
			redis = require("redis").createClient();
		}
		redis.get("prevId", function(err, reply){
			if (err){
				console.error(err);
				process.exit(1);
			}
			if (reply === null){ reply = 0; }
			return callback(reply);
		});
	}
}

function watch(){
	var board;
	for (var ix in cfg.trello.boards){
		board = cfg.trello.boards[ix];
		getBoardActivity(board);
	}

	setTimeout(watch, 1000*60*3);
}

function getBoardActivity(board){
	console.log('getting board activity', board);
	trello.get('/1/boards/' + board.id + '/actions', function(err, resp){
		if (err) throw err;
		// console.log(resp[0]);
		var actions = resp.reverse();

		for (var aix in actions){
			//only concern ourselves with new entries
			var A = actions[aix];
			var actionId = parseInt(A.id, 16);
			if (actionId <= prevId){
				continue;
			}

			if (handlers.hasOwnProperty(A.type)){
				var hndl = handlers[A.type];
				hndl(A, board);
			}

			prevId = Math.max(actionId, prevId);
			writePrevId(prevId);
		}
	});
}

handlers = {
	commentCard: function(A, board){
	   card_in_lists(A.data.card.id, board.lists, function(doNotify){
	   	if (doNotify){
				var card_id_short = A.data.card.idShort
			      ,card_id = A.data.card.id
			      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
			      ,card_name = A.data.card.name
				   ,author = A.memberCreator.fullName
				   ,msg = ':speech_balloon: ' + author + ' commented on card <' + card_url + '|'
				    + sanitize(card_name) + '>: ' + trunc(A.data.text);
				notify(board.slack_channel || cfg.slack.default_channel, msg);
	   	}
	   });
	}
	,addAttachmentToCard: function(A, board){
		card_in_lists(A.data.card.id, board.lists, function(doNotify){
			if (doNotify){
				var card_id_short = A.data.card.idShort
			      ,card_id = A.data.card.id
			      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
			      ,card_name = A.data.card.name
				   ,author = A.memberCreator.fullName
				   ,aurl = A.data.attachment.url;
				var m = ':paperclip: ' + author + ' added an attachment to card <'
				      + card_url + '|' + sanitize(card_name) + '>: '
				      + '<' + aurl + '|' + sanitize(A.data.attachment.name) + '>';
				notify(board.slack_channel || cfg.slack.default_channel, m);
			}
		});
	}
	,updateCard: function(A, board){
		if (A.data.old.hasOwnProperty('idList') && A.data.card.hasOwnProperty('idList')){
			//moving between lists
			var oldId = A.data.old.idList;
			var newId = A.data.card.idList;
			var nameO,nameN;
			var card_id_short = A.data.card.idShort
		      ,card_id = A.data.card.id
		      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
		      ,card_name = A.data.card.name
			   ,author = A.memberCreator.fullName
			   ;
			trello.get('/1/list/' + oldId, function(err, resp){
				if (err) throw err;
				nameO = resp.name;
				trello.get('/1/list/' + newId, function(err, resp){
					if (err) throw err;
					nameN = resp.name;
					if (board.lists.indexOf(nameO) > -1 || board.lists.indexOf(nameN) > -1){
						var msg = ':arrow_heading_up:' + author + ' moved card <'
						        + card_url + '|' + sanitize(card_name) + '> from list '
						        + nameO + ' to list ' + nameN;
						notify(board.slack_channel || cfg.slack.default_channel, msg);
					}
				});
			});
		}
	}
	,updateCheckItemStateOnCard: function(A, board){
		card_in_lists(A.data.card.id, board.lists, function(doNotify){
			if (doNotify){
				var card_id_short = A.data.card.idShort
			      ,card_id = A.data.card.id
			      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
			      ,card_name = A.data.card.name
				   ,author = A.memberCreator.fullName
				   ;
				if (A.data.checkItem.state === 'complete'){
					var msg = ':ballot_box_with_check: ' + author + ' completed "'
					+ A.data.checkItem.name + '" in card <' + card_url + '|' + sanitize(card_name) + '>.';
					notify(board.slack_channel || cfg.slack.default_channel, msg);
				}
			}
		});
	}
};

function notify(room, msg, sender){
	sender = sender || 'Trello';
	slack.send({
		text: msg
		,channel: room
		,username: sender
		,icon_url: 'https://slack.global.ssl.fastly.net/10562/img/services/trello_48.png'
	}, function(err, resp){
		if (err){
			console.error('ERROR:\n', err);
		}
	});
}
function card_in_lists(card_id, lists, callback){
	//use cache if it exists
	if (cachedCardLists.hasOwnProperty(card_id)){
		return callback(cachedCardLists[card_id]);
	}
	//otherwise get the list name
	trello.get('/1/cards/' + card_id + '/list', function(err, resp){
		if (err) throw err;
		var list_name = resp.name;

		var found = (lists.indexOf('*') > -1 || lists.indexOf(list_name) > -1);
		cachedCardLists[card_id] = found;
		callback(found);
	});
}
function sanitize(msg){
	return msg.replace(/([><])/g, function(match, patt, offset, string){
		return (
			patt === '>' ? '&gt;' :
			patt === '<' ? '&lt;' : ''
		);
	});
}
function trunc(s){
	s = s || '';
	if (s.length >= 200)
		return s.slice(0,199) + ' [...]';
	return s;
}
function writePrevId(valu){
	if (mechanism === 'file'){
		fs.writeFileSync('./last.id', valu);
	}else{
		redis.set('prevId', valu, function(err, reply){
			if (err){
				console.error('Error setting new value to redis\n-----------------------------');
				console.error(err);
				process.exit(1);
			}
		});
	}
}
