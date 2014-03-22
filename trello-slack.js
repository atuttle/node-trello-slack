var fs = require('fs')
   ,Trello = require('trello-events')
   ,Slack = require('node-slack');

var cfg, trello, slack, redis, prevId, handlers;
var mechanism = 'file';

module.exports = function(config){
	cfg = config;

	bootstrap(function(prev){
		cfg.minId = prev;
		slack = new Slack(cfg.slack.domain, cfg.slack.token);
		trello = new Trello(cfg);

		trello
			.on('maxId', writePrevId)
			.on('trelloError', function(err){
				console.error(err);
				process.exit(1);
			})
			.on('commentCard', handlers.commentCard)
			.on('addAttachmentToCard', handlers.addAttachmentToCard)
			.on('updateCard', handlers.updateCard)
			.on('updateCheckItemStateOnCard', handlers.updateCheckItemStateOnCard)
	});
}


/*
	handles the choice between redis and local files
*/
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

handlers = {
	commentCard: function(event, boardId){
		var card_id_short = event.data.card.idShort
			,card_id = event.data.card.id
			,card_url = 'https://trello.com/card/' + card_id + '/' + boardId + '/' + card_id_short
			,card_name = event.data.card.name
			,author = event.memberCreator.fullName
			,msg = ':speech_balloon: ' + author + ' commented on card <' + card_url + '|'
				  + sanitize(card_name) + '>: ' + trunc(event.data.text);
		notify(cfg.slack.channel, msg);
	}
	,addAttachmentToCard: function(event, boardId){
		var card_id_short = event.data.card.idShort
			,card_id = event.data.card.id
			,card_url = 'https://trello.com/card/' + card_id + '/' + boardId + '/' + card_id_short
			,card_name = event.data.card.name
			,author = event.memberCreator.fullName
			,aurl = event.data.attachment.url;
		var msg = ':paperclip: ' + author + ' added an attachment to card <'
			   + card_url + '|' + sanitize(card_name) + '>: '
			   + '<' + aurl + '|' + sanitize(event.data.attachment.name) + '>';
		notify(cfg.slack.channel, msg);
	}
	,updateCard: function(event, boardId){
		if (event.data.old.hasOwnProperty('idList') && event.data.card.hasOwnProperty('idList')){
			//moving between lists
			var oldId = event.data.old.idList
				,newId = event.data.card.idList
				,nameO,nameN
				,card_id_short = event.data.card.idShort
		      ,card_id = event.data.card.id
		      ,card_url = 'https://trello.com/card/' + card_id + '/' + boardId + '/' + card_id_short
		      ,card_name = event.data.card.name
			   ,author = event.memberCreator.fullName;
			trello.api.get('/1/list/' + oldId, function(err, resp){
				if (err) throw err;
				nameO = resp.name;
				trello.api.get('/1/list/' + newId, function(err, resp){
					if (err) throw err;
					nameN = resp.name;
					var msg = ':arrow_heading_up:' + author + ' moved card <'
					        + card_url + '|' + sanitize(card_name) + '> from list '
					        + nameO + ' to list ' + nameN;
					notify(cfg.slack.channel, msg);
				});
			});
		}
	}
	,updateCheckItemStateOnCard: function(event, boardId){
		var card_id_short = event.data.card.idShort
			,card_id = event.data.card.id
			,card_url = 'https://trello.com/card/' + card_id + '/' + boardId + '/' + card_id_short
			,card_name = event.data.card.name
			,author = event.memberCreator.fullName;
		if (event.data.checkItem.state === 'complete'){
			var msg = ':ballot_box_with_check: ' + author + ' completed "'
					  + event.data.checkItem.name + '" in card <' + card_url + '|' + sanitize(card_name) + '>.';
			notify(cfg.slack.channel, msg);
		}
	}
};

function notify(room, msg, sender){
	sender = sender || 'Trello';
	slack.send({
		text: msg
		,channel: room
		,username: sender
	}, function(err, resp){
		if (err){
			throw err;
			console.error('ERROR:\n', err);
		}
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
