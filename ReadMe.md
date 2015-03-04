# node-trello-slack

[![wercker status](https://app.wercker.com/status/c5b1d402d7139b17ed6b34ce74a29b3e/s/master "wercker status")](https://app.wercker.com/project/bykey/c5b1d402d7139b17ed6b34ce74a29b3e)
<br/>[![Dependency Status](https://david-dm.org/atuttle/node-trello-slack.svg?style=flat)](https://david-dm.org/atuttle/node-trello-slack)

The built-in integration for Trello provided by Slack/SlackHQ isn't enough. It's limited to one board!

This tool will check the trello api once a minute for updates and push them into your desired channels. You can configure any number of boards.

### Install

	npm install --save node-trello-slack

### Usage

Create an executable script with the following code:

```js
#!/usr/bin/env node

var Bot = require('node-trello-slack')
	,bot = new Bot({
		pollFrequency: 1000*60*3 //every 3 minutes
		,start: true
		,trello: {
			boards: ['Nz5nyqZg','...']
			,key: 'trello-key-here'
			,token: 'trello-token-here'
			,events: ['createCard','commentCard','addAttachmentToCard','updateCard','updateCheckItemStateOnCard']
		}
		,slack: {
			domain: 'slack-domain-here'
			,token: 'slack-webhook-token-here'
			,channel: '#general'
		}
	});
```

You may completely omit `trello.events`, which indicates that you want all (recognized) events announced. All recognized events are listed in the example above. Alternately, include some subset of the list shown above. (Case sensitive)

### Trello-board-specific channels

If you want to send alerts from each board to a different Slack channel, pass object hashes instead of string board id's in the `trello.boards` array, as you see here:

```js
,trello: {
	boards: [
		{
			id: 'Nz5nyqZg'
			,channel: '#general'
		}
		,{
			id: '...'
			,channel: '#devops'
		}
	]
	,key: 'trello-key-here'
	,token: 'trello-token-here'
}
```

## Getting your Trello and Slack credentials

You'll need a **Trello key and token.** [Get your key here](https://trello.com/1/appKey/generate): it's the one in the box near the top labeled "key." Once you have that key, substitute it into the following url for <KEY-HERE> and open it up in a browser tab:

    https://trello.com/1/connect?name=node-trello-slack&response_type=token&expiration=never&key=<KEY-HERE>

You'll also need your webhook **token and domain** for Slack. The domain is just the part of the url before `.slack.com`. To get your token, go to the following url (substituting your domain for `<YOUR-DOMAIN>`) and add the webhook integration (if it's not already enabled). The token will be listed in the left sidebar.

    https://<YOUR-DOMAIN>.slack.com/services/new/incoming-webhook

Fill all four of these values into your bot config, and tweak the other options

## Running...

Once you've configured access to your Trello and Slack accounts, the last thing to know is how this tool knows what events it's already seen. There are two options: File system, and Redis.

### ...locally (or where the file system is writeable)

The simplest is using the file system. Just create a file named `last.id` in the root folder of the project and put the number `0` into it. As long as the filesystem is writeable the file will be updated when new board actions have been seen.

### ...on Heroku (or where the file system is not writeable)

I run this tool on Heroku (a single free dyno works great!) but they dont allow you to write to the filesystem. Instead, I use Redis. Add the free **Redis To Go** addon and everything should just work out of the box.

    heroku create
    heroku addons:add redistogo
    git push heroku master
    heroku ps:scale worker=1 && heroku logs -t

This will push whatever you've got committed in your local git repo up to a new heroku app connected to a free RedisToGo instance, running on a free Heroku worker dyno, and tail the Heroku log file -- just in case there are errors. If no errors appear after a minute or two, just hit ctrl+c to exit the log tail and go about your business.

Enjoy!

# The MIT License (MIT)

> Copyright (c) 2014 Adam Tuttle

> Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

> The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
