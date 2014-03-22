var chai = require('chai');
var Bot = require('../trello-slack');

chai.should();

describe("trello-slack", function(){

	describe("configuration", function(){

		it("should accept objects for trello boards", function(done){

			var bot = new Bot({
				pollFrequency: 1000*60*3 //every 3 minutes
				,start: false
				,trello: {
					boards: [{id:'Nz5nyqZg',channel:'#general'}]
					,key: 'trello-key-here'
					,token: 'trello-token-here'
				}
				,slack: {
					domain: 'slack-domain-here'
					,token: 'slack-webhook-token-here'
					,channel: '#general'
				}
			});

			var config = bot.getConfig();
			config.trello.boardChannels.should.have.property('Nz5nyqZg')
			config.trello.boardChannels['Nz5nyqZg'].should.equal('#general');

			done();

		});

		it("should accept strings for trello boards", function(done){

			var bot = new Bot({
				pollFrequency: 1000*60*3 //every 3 minutes
				,start: false
				,trello: {
					boards: ['Nz5nyqZg']
					,key: 'trello-key-here'
					,token: 'trello-token-here'
				}
				,slack: {
					domain: 'slack-domain-here'
					,token: 'slack-webhook-token-here'
					,channel: '#devops'
				}
			});

			var config = bot.getConfig();
			config.trello.boardChannels.should.have.property('Nz5nyqZg')
			config.trello.boardChannels['Nz5nyqZg'].should.equal('#devops');

			done();

		});

	});

});
