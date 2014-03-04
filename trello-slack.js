#!/usr/bin/env node

var fs = require('fs')
   ,Trello = require('node-trello')
   ,Slack = require('node-slack');

var cfg = require('./config.json');
var trello = new Trello(cfg.trello.auth.key, cfg.trello.auth.token);
var slack = new Slack(cfg.slack.domain, cfg.slack.token);
var redis, prevId, board, actions, msg, cachedCardLists = {};
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
	for (var ix in cfg.trello.boards){
		board = cfg.trello.boards[ix];

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

				if (A.type === "commentCard"){
					// console.log(A.data.text);
					// process.exit(1);
				   card_in_lists(card_id, board.lists, A, function(doNotify, B){
				   	if (doNotify){
							var card_id_short = B.data.card.idShort
						      ,card_id = B.data.card.id
						      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
						      ,card_name = B.data.card.name
							   ,author = B.memberCreator.fullName
							   ,msg = ':godmode: ' + author + ' commented on card :pencil: <' + card_url + '|'
							    + card_name + '>: ' + trunc(B.data.text);
							notify(board.slack_channel || cfg.slack.default_channel, msg);
				   	}
				   });
				}else if (A.type === 'addAttachmentToCard'){
					card_in_lists(card_id, board.lists, A, function(doNotify, B){
						if (doNotify){
							var card_id_short = B.data.card.idShort
						      ,card_id = B.data.card.id
						      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
						      ,card_name = B.data.card.name
							   ,author = B.memberCreator.fullName
							   ,aurl = B.data.attachment.url;
							var m = ':godmode: ' + author + ' added an attachment to card :pencil: <'
							      + card_url + '|' + card_name + '>: '
							      + '<' + aurl + '|' + B.data.attachment.name + '>';
							notify(board.slack_channel || cfg.slack.default_channel, m);
							if (aurl){
								var aurllower = aurl.toLowerCase();
								if (aurllower.match(/.+(\.png|\.gif|\.jpg|\.jpeg)$/)){
									notify(board.slack_channel || cfg.slack.default_channel, aurl);
								}
							}
						}
					});
				}else if (A.type === 'updateCard'){
					if (A.data.old.hasOwnProperty('idList') && A.data.card.hasOwnProperty('idList')){
						//moving between lists
						encapsulate(A, function(B){
							var oldId = B.data.old.idList;
							var newId = B.data.card.idList;
							var nameO,nameN;
							var card_id_short = B.data.card.idShort
						      ,card_id = B.data.card.id
						      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
						      ,card_name = B.data.card.name
							   ,author = B.memberCreator.fullName
							   ;
							trello.get('/1/list/' + oldId, function(err, resp){
								if (err) throw err;
								nameO = resp.name;
								trello.get('/1/list/' + newId, function(err, resp){
									if (err) throw err;
									nameN = resp.name;
									if (board.lists.indexOf(nameO) > -1 || board.lists.indexOf(nameN) > -1){
										var msg = ':godmode:' + author + ' moved card <'
										        + card_url + '|' + card_name + '> from list '
										        + nameO + ' to list ' + nameN;
										notify(board.hipchat_room, msg);
									}
								});
							});
						});
					}
				}else if (A.type === 'updateCheckItemStateOnCard'){
					card_in_lists(A.data.card.id, board.lists, A, function(doNotify, B){
						if (doNotify){
							var card_id_short = B.data.card.idShort
						      ,card_id = B.data.card.id
						      ,card_url = 'https://trello.com/card/' + card_id + '/' + board.id + '/' + card_id_short
						      ,card_name = B.data.card.name
							   ,author = B.memberCreator.fullName
							   ;
							if (B.data.checkItem.state === 'complete'){
								var msg = ':ballot_box_with_check: ' + author + ' completed "'
								+ B.data.checkItem.name + '" in card <' + card_url + '|' + card_name + '>.';
								notify(board.slack_channel || cfg.slack.default_channel, msg);
							}
						}
					});
				}

				prevId = Math.max(actionId, prevId);
				writePrevId(prevId);
			}
		});
	}

	setTimeout(watch, 1000*60*3);
}

function notify(room, msg, sender){
	sender = sender || 'Trello';
	slack.send({
		text: msg
		,channel: room
		,username: sender
		,icon_url: "http://i.imgur.com/kYkDBjH.png"
	}, function(err, resp){
		if (err){
			console.error('ERROR:\n', err);
		}
	});
}
function card_in_lists(card_id, lists, A, callback){
	//use cache if it exists
	if (cachedCardLists.hasOwnProperty(card_id)){
		return callback(cachedCardLists[card_id], A);
	}
	//otherwise get the list name
	trello.get('/1/cards/' + card_id + '/list', function(err, resp){
		if (err) throw err;
		var list_name = resp.name;

		var found = (lists.indexOf('*') > -1 || lists.indexOf(list_name) > -1);
		cachedCardLists[card_id] = found;
		callback(found, A);
	});
}
function encapsulate(A,cb){
	return cb(A);
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
